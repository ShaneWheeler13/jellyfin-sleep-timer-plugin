namespace Jellyfin.Plugin.SleepTimer;

/// <summary>
/// Plugin configuration for Sleep Timer.
/// Server-side options control default timer behavior and popup grace period.
/// The config page also handles per-device install/uninstall of the player
/// button via localStorage.
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
    /// </summary>
    public int PopupGracePeriodSeconds { get; set; } = 60;

    /// <summary>
    /// Whether the "Are you still watching?" popup is enabled.
    /// When false, playback stops immediately when the timer expires
    /// with no grace period or user interaction.
    /// </summary>
    public bool EnablePopup { get; set; } = true;
}