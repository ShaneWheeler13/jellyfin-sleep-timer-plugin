using System.Collections.Concurrent;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Session;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SleepTimer;

/// <summary>
/// Manages sleep timers for all active playback sessions.
/// The server is the source of truth — the client calls the API for every
/// action (start, extend, cancel, popup response). A single monitor loop
/// polls all timers every second and acts as a fallback: if the client
/// never responds to the popup, the server hard-stops playback after the
/// grace period expires.
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
    /// How long the client has to respond to the popup before the server
    /// hard-stops playback (seconds).
    /// </summary>
    private const int PopupGracePeriodSeconds = 60;

    /// <summary>
    /// How often the monitor loop checks all timers (milliseconds).
    /// </summary>
    private const int MonitorIntervalMs = 1000;

    /// <summary>
    /// Creates the manager, starts the cleanup and monitor timers.
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
    /// Raised when a timer is started, extended, or cancelled.
    /// </summary>
    public event EventHandler<SleepTimerEventArgs>? TimerUpdated;

    /// <summary>
    /// Raised when a timer fully expires and playback is stopped by the server.
    /// </summary>
    public event EventHandler<SleepTimerEventArgs>? TimerExpired;

    /// <summary>
    /// Start (or replace) a sleep timer for a session.
    /// If a timer already exists for this session, it is overwritten.
    /// </summary>
    /// <param name="sessionId">Jellyfin session ID.</param>
    /// <param name="userId">Jellyfin user ID.</param>
    /// <param name="durationMinutes">Countdown length in minutes.</param>
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
    /// Cancel the timer for a session. Removes it from the active set.
    /// </summary>
    /// <param name="sessionId">Jellyfin session ID.</param>
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
    /// Get the timer for a session, or null if none exists.
    /// </summary>
    /// <param name="sessionId">Jellyfin session ID.</param>
    public SleepTimer? GetTimer(string sessionId)
    {
        return _timers.TryGetValue(sessionId, out var timer) ? timer : null;
    }

    /// <summary>
    /// Returns a snapshot of all active timers.
    /// </summary>
    public IEnumerable<SleepTimer> GetAllTimers()
    {
        return _timers.Values.ToList();
    }

    /// <summary>
    /// Add time to an existing timer. If the timer is in PopupPending,
    /// it reverts to Running and the popup is dismissed.
    /// </summary>
    /// <param name="sessionId">Jellyfin session ID.</param>
    /// <param name="additionalMinutes">Minutes to add to EndTime.</param>
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
    /// Process the client's popup response.
    /// "continue" cancels the timer (user is still awake).
    /// "stop" immediately stops playback.
    /// </summary>
    /// <param name="sessionId">Jellyfin session ID.</param>
    /// <param name="action">"continue" or "stop".</param>
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
    /// Monitor callback — runs every MonitorIntervalMs. Checks each timer:
    /// if Running and past EndTime, transitions to PopupPending; if
    /// PopupPending and past PopupDeadline, hard-stops playback.
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

    /// <summary>
    /// Sends a Stop playstate command to the client via the session manager.
    /// </summary>
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

    /// <summary>
    /// Periodic cleanup — removes stopped/cancelled timers whose EndTime
    /// is more than 5 minutes in the past. Frees memory from dead sessions.
    /// </summary>
    private void CleanupExpiredTimers(object? state)
    {
        var now = DateTime.UtcNow;
        foreach (var kvp in _timers)
        {
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