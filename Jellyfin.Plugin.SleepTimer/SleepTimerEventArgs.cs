namespace Jellyfin.Plugin.SleepTimer;

/// <summary>
/// Payload for <see cref="SleepTimerManager.TimerUpdated"/> and
/// <see cref="SleepTimerManager.TimerExpired"/> events.
/// </summary>
public class SleepTimerEventArgs : EventArgs
{
    /// <summary>
    /// Creates event args wrapping the affected timer.
    /// </summary>
    public SleepTimerEventArgs(SleepTimer timer)
    {
        Timer = timer;
    }

    /// <summary>
    /// The sleep timer that triggered the event.
    /// </summary>
    public SleepTimer Timer { get; }
}