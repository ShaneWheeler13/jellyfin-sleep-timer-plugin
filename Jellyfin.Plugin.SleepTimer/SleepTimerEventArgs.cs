namespace Jellyfin.Plugin.SleepTimer;

/// <summary>
/// Event args for sleep timer events.
/// </summary>
public class SleepTimerEventArgs : EventArgs
{
    /// <summary>
    /// Initializes a new instance of the <see cref="SleepTimerEventArgs"/> class.
    /// </summary>
    public SleepTimerEventArgs(SleepTimer timer)
    {
        Timer = timer;
    }

    /// <summary>
    /// Gets the sleep timer.
    /// </summary>
    public SleepTimer Timer { get; }
}