using System.Collections.Concurrent;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Session;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SleepTimer;

/// <summary>
/// Manages sleep timers for playback sessions.
/// The server acts as the source of truth for timer state. The client
/// calls the API to start/extend/cancel and to report popup responses.
/// The server monitoring loop acts as a fallback: if the client never
/// responds to the popup, the server stops playback after the grace period.
/// </summary>
public class SleepTimerManager : IDisposable
{
    private readonly ISessionManager _sessionManager;
    private readonly ILogger _logger;
    private readonly ConcurrentDictionary<string, SleepTimer> _timers = new();
    private readonly Timer _cleanupTimer;
    private readonly Timer _monitorTimer;
    private bool _disposed;

    /// <summary>
    /// Popup grace period in seconds. The client has this long to respond
    /// to the "Are you still watching?" popup before the server hard-stops.
    /// </summary>
    private const int PopupGracePeriodSeconds = 60;

    /// <summary>
    /// Monitor polling interval in milliseconds.
    /// </summary>
    private const int MonitorIntervalMs = 1000;

    /// <summary>
    /// Initializes a new instance of the <see cref="SleepTimerManager"/> class.
    /// </summary>
    public SleepTimerManager(ISessionManager sessionManager, ILogger logger)
    {
        _sessionManager = sessionManager;
        _logger = logger;
        _cleanupTimer = new Timer(CleanupExpiredTimers, null, TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(5));
        // Single monitor timer checks all active timers — no per-timer polling loops
        _monitorTimer = new Timer(MonitorAllTimers, null, TimeSpan.FromMilliseconds(MonitorIntervalMs), TimeSpan.FromMilliseconds(MonitorIntervalMs));
    }

    /// <summary>
    /// Event raised when a timer is started or updated.
    /// </summary>
    public event EventHandler<SleepTimerEventArgs>? TimerUpdated;

    /// <summary>
    /// Event raised when a timer expires and playback is stopped.
    /// </summary>
    public event EventHandler<SleepTimerEventArgs>? TimerExpired;

    /// <summary>
    /// Start a sleep timer for a specific session/user.
    /// </summary>
    /// <param name="sessionId">The Jellyfin session ID.</param>
    /// <param name="userId">The user ID.</param>
    /// <param name="durationMinutes">Timer duration in minutes.</param>
    public void StartTimer(
        string sessionId,
        Guid userId,
        int durationMinutes)
    {
        // Validate duration
        if (durationMinutes <= 0)
        {
            _logger.LogWarning("Rejecting sleep timer with invalid duration: {Minutes} minutes", durationMinutes);
            return;
        }

        var endTime = DateTime.UtcNow.AddMinutes(durationMinutes);
        var timer = new SleepTimer
        {
            SessionId = sessionId,
            UserId = userId,
            StartTime = DateTime.UtcNow,
            EndTime = endTime,
            DurationMinutes = durationMinutes,
            State = SleepTimerState.Running
        };

        _timers[sessionId] = timer;

        _logger.LogInformation("Sleep timer started for session {SessionId}: {Minutes} minutes (ends at {EndTime:HH:mm:ss} UTC)",
            sessionId, durationMinutes, endTime);

        TimerUpdated?.Invoke(this, new SleepTimerEventArgs(timer));
    }

    /// <summary>
    /// Cancel the sleep timer for a session.
    /// </summary>
    /// <param name="sessionId">The session ID.</param>
    public void CancelTimer(string sessionId)
    {
        if (_timers.TryRemove(sessionId, out var timer))
        {
            timer.State = SleepTimerState.Cancelled;
            _logger.LogInformation("Sleep timer cancelled for session {SessionId}", sessionId);
            TimerUpdated?.Invoke(this, new SleepTimerEventArgs(timer));
        }
    }

    /// <summary>
    /// Get the active sleep timer for a session.
    /// </summary>
    /// <param name="sessionId">The session ID.</param>
    /// <returns>The sleep timer, or null if none active.</returns>
    public SleepTimer? GetTimer(string sessionId)
    {
        return _timers.TryGetValue(sessionId, out var timer) ? timer : null;
    }

    /// <summary>
    /// Get all active sleep timers.
    /// </summary>
    public IEnumerable<SleepTimer> GetAllTimers()
    {
        return _timers.Values.ToList();
    }

    /// <summary>
    /// Extend the sleep timer for a session.
    /// </summary>
    /// <param name="sessionId">The session ID.</param>
    /// <param name="additionalMinutes">Minutes to add.</param>
    public void ExtendTimer(string sessionId, int additionalMinutes)
    {
        if (additionalMinutes <= 0)
        {
            _logger.LogWarning("Rejecting extend with invalid duration: {Minutes} minutes", additionalMinutes);
            return;
        }

        if (_timers.TryGetValue(sessionId, out var timer))
        {
            timer.EndTime = timer.EndTime.AddMinutes(additionalMinutes);
            // If the timer was in popup-pending state, go back to running
            if (timer.State == SleepTimerState.PopupPending)
            {
                timer.State = SleepTimerState.Running;
                timer.PopupDeadline = null;
            }

            _logger.LogInformation("Sleep timer extended for session {SessionId}: +{Minutes} minutes (new end: {EndTime:HH:mm:ss} UTC)",
                sessionId, additionalMinutes, timer.EndTime);
            TimerUpdated?.Invoke(this, new SleepTimerEventArgs(timer));
        }
    }

    /// <summary>
    /// Handle the client's response to the "Are you still watching?" popup.
    /// </summary>
    /// <param name="sessionId">The session ID.</param>
    /// <param name="action">The user's action: "continue" or "stop".</param>
    public void HandlePopupResponse(string sessionId, string action)
    {
        if (!_timers.TryGetValue(sessionId, out var timer))
        {
            _logger.LogWarning("Popup response for unknown session {SessionId}", sessionId);
            return;
        }

        if (action == "stop")
        {
            _logger.LogInformation("User chose to stop playback for session {SessionId}", sessionId);
            _ = StopPlaybackAsync(timer);
        }
        else if (action == "continue")
        {
            _logger.LogInformation("User chose to continue watching for session {SessionId}", sessionId);
            // Cancel the timer — user is still awake
            CancelTimer(sessionId);
        }
        else
        {
            _logger.LogWarning("Unknown popup action '{Action}' for session {SessionId}", action, sessionId);
        }
    }

    /// <summary>
    /// Single monitor callback that checks all timers.
    /// Replaces the old per-timer polling loop.
    /// </summary>
    private void MonitorAllTimers(object? state)
    {
        if (_disposed) return;

        var now = DateTime.UtcNow;

        foreach (var kvp in _timers)
        {
            var timer = kvp.Value;

            // Skip already-expired or cancelled timers
            if (timer.State == SleepTimerState.Stopped ||
                timer.State == SleepTimerState.Cancelled)
            {
                continue;
            }

            // Timer is running and has reached zero → transition to popup-pending
            if (timer.State == SleepTimerState.Running && now >= timer.EndTime)
            {
                timer.State = SleepTimerState.PopupPending;
                timer.PopupDeadline = now.AddSeconds(PopupGracePeriodSeconds);
                _logger.LogInformation("Sleep timer expired for session {SessionId} — popup pending (grace period: {Seconds}s)",
                    timer.SessionId, PopupGracePeriodSeconds);
                TimerUpdated?.Invoke(this, new SleepTimerEventArgs(timer));
            }

            // Popup grace period has expired → hard stop playback
            if (timer.State == SleepTimerState.PopupPending &&
                timer.PopupDeadline.HasValue && now >= timer.PopupDeadline.Value)
            {
                timer.State = SleepTimerState.Stopped;
                timer.IsExpired = true;
                _ = StopPlaybackAsync(timer);
                _timers.TryRemove(timer.SessionId, out _);
                TimerExpired?.Invoke(this, new SleepTimerEventArgs(timer));
            }
        }
    }

    private async Task StopPlaybackAsync(SleepTimer timer)
    {
        try
        {
            var stopRequest = new PlaystateRequest
            {
                Command = PlaystateCommand.Stop
            };

            await _sessionManager.SendPlaystateCommand(
                null,
                timer.SessionId,
                stopRequest,
                CancellationToken.None);

            _logger.LogInformation("Playback stopped for session {SessionId} (sleep timer expired)", timer.SessionId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to stop playback for session {SessionId}", timer.SessionId);
        }
    }

    private void CleanupExpiredTimers(object? state)
    {
        var now = DateTime.UtcNow;
        foreach (var kvp in _timers)
        {
            // Remove timers that have been stopped or cancelled for more than 5 minutes
            if ((kvp.Value.State == SleepTimerState.Stopped || kvp.Value.State == SleepTimerState.Cancelled) &&
                now > kvp.Value.EndTime.AddMinutes(5))
            {
                _timers.TryRemove(kvp.Key, out _);
            }
        }
    }

    /// <inheritdoc />
    public void Dispose()
    {
        if (_disposed)
            return;

        _cleanupTimer.Dispose();
        _monitorTimer.Dispose();
        _disposed = true;
    }
}