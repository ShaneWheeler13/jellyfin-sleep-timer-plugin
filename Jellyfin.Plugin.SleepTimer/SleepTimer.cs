namespace Jellyfin.Plugin.SleepTimer;

/// <summary>
/// Data model for a single sleep timer associated with a Jellyfin playback session.
/// The server holds the authoritative copy; the client mirrors it via API calls.
/// </summary>
public class SleepTimer
{
    /// <summary>
    /// Jellyfin session ID this timer is bound to.
    /// </summary>
    public string SessionId { get; set; } = string.Empty;

    /// <summary>
    /// Jellyfin user ID that owns this session.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// When the timer was started (UTC).
    /// </summary>
    public DateTime StartTime { get; set; }

    /// <summary>
    /// When the timer should expire (UTC). The monitor loop compares this
    /// against the current time to detect expiry.
    /// </summary>
    public DateTime EndTime { get; set; }

    /// <summary>
    /// Original requested duration in minutes.
    /// </summary>
    public int DurationMinutes { get; set; }

    /// <summary>
    /// True once the timer has fully expired and playback has been stopped.
    /// </summary>
    public bool IsExpired { get; set; }

    /// <summary>
    /// Current lifecycle state. See <see cref="SleepTimerState"/>.
    /// </summary>
    public SleepTimerState State { get; set; } = SleepTimerState.Running;

    /// <summary>
    /// Deadline for the "Are you still watching?" grace period (UTC).
    /// Set when the timer transitions from Running to PopupPending.
    /// If the client doesn't respond before this time, the server hard-stops playback.
    /// </summary>
    public DateTime? PopupDeadline { get; set; }

    /// <summary>
    /// Time left before the countdown reaches zero. Negative if already expired.
    /// </summary>
    public TimeSpan Remaining => EndTime - DateTime.UtcNow;

    /// <summary>
    /// Time left in the popup grace period, or null if no popup is pending.
    /// </summary>
    public TimeSpan? PopupRemaining => PopupDeadline.HasValue ? PopupDeadline.Value - DateTime.UtcNow : null;
}

/// <summary>
/// Lifecycle states for a sleep timer.
/// </summary>
public enum SleepTimerState
{
    /// <summary>
    /// Counting down toward EndTime.
    /// </summary>
    Running,

    /// <summary>
    /// Countdown has reached zero. The "Are you still watching?" popup is
    /// showing on the client. The server waits for a response until
    /// PopupDeadline, then hard-stops if none comes.
    /// </summary>
    PopupPending,

    /// <summary>
    /// User explicitly cancelled the timer (or clicked "Continue Watching").
    /// </summary>
    Cancelled,

    /// <summary>
    /// Playback has been stopped — either the user clicked "Stop Now" or
    /// the popup grace period elapsed without a response.
    /// </summary>
    Stopped
}