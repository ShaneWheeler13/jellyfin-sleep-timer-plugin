using System.Collections.Concurrent;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Session;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SleepTimer;

/// <summary>
/// Manages sleep timers for playback sessions.
/// </summary>
public class SleepTimerManager : IDisposable
{
    private readonly ISessionManager _sessionManager;
    private readonly ILogger _logger;
    private readonly ConcurrentDictionary<string, SleepTimer> _timers = new();
    private readonly Timer _cleanupTimer;
    private bool _disposed;

    /// <summary>
    /// Initializes a new instance of the <see cref="SleepTimerManager"/> class.
    /// </summary>
    public SleepTimerManager(ISessionManager sessionManager, ILogger logger)
    {
        _sessionManager = sessionManager;
        _logger = logger;
        _cleanupTimer = new Timer(CleanupExpiredTimers, null, TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(5));
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
    /// <param name="notifyBeforeStop">Whether to show a notification before stopping.</param>
    /// <param name="notifyLeadTimeSeconds">Notification lead time in seconds.</param>
    public void StartTimer(
        string sessionId,
        Guid userId,
        int durationMinutes,
        bool notifyBeforeStop = true,
        int notifyLeadTimeSeconds = 30)
    {
        var endTime = DateTime.UtcNow.AddMinutes(durationMinutes);
        var timer = new SleepTimer
        {
            SessionId = sessionId,
            UserId = userId,
            StartTime = DateTime.UtcNow,
            EndTime = endTime,
            DurationMinutes = durationMinutes,
            NotifyBeforeStop = notifyBeforeStop,
            NotifyLeadTimeSeconds = notifyLeadTimeSeconds,
            NotificationSent = false
        };

        _timers[sessionId] = timer;

        _logger.LogInformation("Sleep timer started for session {SessionId}: {Minutes} minutes (ends at {EndTime:HH:mm:ss} UTC)",
            sessionId, durationMinutes, endTime);

        TimerUpdated?.Invoke(this, new SleepTimerEventArgs(timer));

        // Start the monitoring timer
        _ = MonitorTimerAsync(timer);
    }

    /// <summary>
    /// Cancel the sleep timer for a session.
    /// </summary>
    /// <param name="sessionId">The session ID.</param>
    public void CancelTimer(string sessionId)
    {
        if (_timers.TryRemove(sessionId, out var timer))
        {
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
        if (_timers.TryGetValue(sessionId, out var timer))
        {
            timer.EndTime = timer.EndTime.AddMinutes(additionalMinutes);
            _logger.LogInformation("Sleep timer extended for session {SessionId}: +{Minutes} minutes (new end: {EndTime:HH:mm:ss} UTC)",
                sessionId, additionalMinutes, timer.EndTime);
            TimerUpdated?.Invoke(this, new SleepTimerEventArgs(timer));
        }
    }

    private async Task MonitorTimerAsync(SleepTimer timer)
    {
        var notifyTime = timer.EndTime.AddSeconds(-timer.NotifyLeadTimeSeconds);

        while (!timer.IsExpired && _timers.ContainsKey(timer.SessionId))
        {
            var now = DateTime.UtcNow;

            // Send notification before stopping
            if (timer.NotifyBeforeStop && !timer.NotificationSent && now >= notifyTime)
            {
                timer.NotificationSent = true;
                try
                {
                    var command = new MessageCommand
                    {
                        Header = "Sleep Timer",
                        Text = $"Playback will stop in {timer.NotifyLeadTimeSeconds} seconds.",
                        TimeoutMs = 5000
                    };

                    await _sessionManager.SendMessageCommand(
                        null,
                        timer.SessionId,
                        command,
                        CancellationToken.None);

                    _logger.LogInformation("Sleep timer notification sent for session {SessionId}", timer.SessionId);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to send sleep timer notification");
                }
            }

            // Stop playback
            if (now >= timer.EndTime)
            {
                timer.IsExpired = true;
                await StopPlaybackAsync(timer);
                _timers.TryRemove(timer.SessionId, out _);
                TimerExpired?.Invoke(this, new SleepTimerEventArgs(timer));
                break;
            }

            await Task.Delay(1000);
        }
    }

    private async Task StopPlaybackAsync(SleepTimer timer)
    {
        try
        {
            // Send a Stop playstate command
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
            if (now > kvp.Value.EndTime.AddMinutes(5))
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
        _disposed = true;
    }
}