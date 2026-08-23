namespace Jellyfin.Plugin.SleepTimer;

/// <summary>
/// Plugin configuration for Sleep Timer.
/// No server-side options are exposed — the config page only handles
/// per-device install/uninstall of the player button via localStorage.
/// </summary>
public class PluginConfiguration : MediaBrowser.Model.Plugins.BasePluginConfiguration
{
}