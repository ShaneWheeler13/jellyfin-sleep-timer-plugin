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
    /// Gets the remaining time.
    /// </summary>
    public TimeSpan Remaining => EndTime - DateTime.UtcNow;
}