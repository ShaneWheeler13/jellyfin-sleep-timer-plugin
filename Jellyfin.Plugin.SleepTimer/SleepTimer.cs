namespace Jellyfin.Plugin.SleepTimer;

/// <summary>
/// Represents a sleep timer for a playback session.
/// </summary>
public class SleepTimer
{
    /// <summary>
    /// Gets or sets the session ID.
    /// </summary>
    public string SessionId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the user ID.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// Gets or sets the timer start time (UTC).
    /// </summary>
    public DateTime StartTime { get; set; }

    /// <summary>
    /// Gets or sets the timer end time (UTC).
    /// </summary>
    public DateTime EndTime { get; set; }

    /// <summary>
    /// Gets or sets the duration in minutes.
    /// </summary>
    public int DurationMinutes { get; set; }

    /// <summary>
    /// Gets or sets whether the timer has expired.
    /// </summary>
    public bool IsExpired { get; set; }

    /// <summary>
    /// Gets or sets the timer state.
    /// </summary>
    public SleepTimerState State { get; set; } = SleepTimerState.Running;

    /// <summary>
    /// Gets or sets when the popup grace period ends (UTC).
    /// Set when the timer reaches zero and the popup is shown.
    /// </summary>
    public DateTime? PopupDeadline { get; set; }

    /// <summary>
    /// Gets the remaining time before the timer reaches zero.
    /// </summary>
    public TimeSpan Remaining => EndTime - DateTime.UtcNow;

    /// <summary>
    /// Gets the remaining time in the popup grace period, or null if no popup is pending.
    /// </summary>
    public TimeSpan? PopupRemaining => PopupDeadline.HasValue ? PopupDeadline.Value - DateTime.UtcNow : null;
}

/// <summary>
/// Represents the state of a sleep timer.
/// </summary>
public enum SleepTimerState
{
    /// <summary>
    /// Timer is counting down.
    /// </summary>
    Running,

    /// <summary>
    /// Timer has reached zero and the "Are you still watching?" popup is showing.
    /// The server waits for a client response before stopping playback.
    /// </summary>
    PopupPending,

    /// <summary>
    /// Timer has been cancelled by the user.
    /// </summary>
    Cancelled,

    /// <summary>
    /// Playback has been stopped (either by user clicking "Stop Now" or by the grace period expiring).
    /// </summary>
    Stopped
}