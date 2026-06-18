using System.Xml.Serialization;

namespace Jellyfin.Plugin.SleepTimer;

/// <summary>
/// Plugin configuration for Sleep Timer.
/// </summary>
public class PluginConfiguration : MediaBrowser.Model.Plugins.BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets the default timer duration in minutes.
    /// </summary>
    [XmlAttribute("DefaultDurationMinutes")]
    public int DefaultDurationMinutes { get; set; } = 30;

    /// <summary>
    /// Gets or sets whether to show a notification before stopping.
    /// </summary>
    [XmlAttribute("ShowNotification")]
    public bool ShowNotification { get; set; } = true;

    /// <summary>
    /// Gets or sets the notification lead time in seconds before stopping.
    /// </summary>
    [XmlAttribute("NotificationLeadTimeSeconds")]
    public int NotificationLeadTimeSeconds { get; set; } = 30;
}