namespace Jellyfin.Plugin.SleepTimer;

/// <summary>
/// Plugin configuration for Sleep Timer.
/// Server-side options control default timer behavior, popup grace period,
/// and volume fading. The config page also handles per-device
/// install/uninstall of the player button via localStorage.
/// </summary>
public class PluginConfiguration : MediaBrowser.Model.Plugins.BasePluginConfiguration
{
    /// <summary>
    /// Default duration in minutes when a user starts a timer without
    /// selecting a preset. Currently informational — the client always
    /// sends an explicit duration. Could be used in the future for a
    /// "quick start" button.
    /// </summary>
    public int DefaultDurationMinutes { get; set; } = 30;

    /// <summary>
    /// How long (in seconds) the "Are you still watching?" popup stays
    /// on screen before the server hard-stops playback. Default 60s.
    /// Set to 0 to disable the popup entirely — playback will stop
    /// immediately when the timer reaches zero.
    /// This value also drives the volume fade duration when
    /// <see cref="EnableVolumeFade"/> is true, so the two stay in sync.
    /// </summary>
    public int PopupGracePeriodSeconds { get; set; } = 60;

    /// <summary>
    /// Whether the "Are you still watching?" popup is enabled.
    /// When false, playback stops immediately when the timer expires
    /// with no grace period or user interaction.
    /// </summary>
    public bool EnablePopup { get; set; } = true;

    /// <summary>
    /// Whether playback volume fades to zero over the popup grace period
    /// instead of stopping at full volume. The fade begins when the popup
    /// appears and completes just before playback stops.
    /// The original volume is restored after playback stops so the next
    /// session is not left muted.
    /// </summary>
    public bool EnableVolumeFade { get; set; }
}
