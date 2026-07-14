using System.Xml.Serialization;

namespace Jellyfin.Plugin.SleepTimer;

/// <summary>
/// Plugin configuration for Sleep Timer.
/// </summary>
public class PluginConfiguration : MediaBrowser.Model.Plugins.BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets whether to show a notification before stopping.
    /// </summary>
    [XmlAttribute("ShowNotification")]
    public bool ShowNotification { get; set; } = true;
}