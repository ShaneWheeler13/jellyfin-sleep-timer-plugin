using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SleepTimer;

/// <summary>
/// Jellyfin Sleep Timer plugin entry point.
/// Registers the API controller, middleware, and web config page.
/// Stops playback after a user-defined duration with a grace-period popup.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    private readonly ISessionManager _sessionManager;
    private readonly ILogger<Plugin> _logger;
    private readonly SleepTimerManager _timerManager;

    /// <summary>
    /// Wires up the SleepTimerManager and sets the singleton instance.
    /// </summary>
    public Plugin(
        IApplicationPaths applicationPaths,
        IXmlSerializer xmlSerializer,
        ISessionManager sessionManager,
        ILogger<Plugin> logger)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
        _sessionManager = sessionManager;
        _logger = logger;
        _timerManager = new SleepTimerManager(sessionManager, logger);
    }

    /// <inheritdoc />
    public override string Name => "Sleep Timer";

    /// <inheritdoc />
    public override Guid Id => new("a3f1c7d2-8e4b-4f6a-9c1d-2b5e8a7f3d60");

    /// <summary>
    /// Singleton instance — used by the API controller to access the TimerManager.
    /// </summary>
    public static Plugin? Instance { get; private set; }

    /// <summary>
    /// The active timer manager for this server instance.
    /// </summary>
    public SleepTimerManager TimerManager => _timerManager;

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages()
    {
        return new[]
        {
            new PluginPageInfo
            {
                Name = "SleepTimer",
                DisplayName = "Sleep Timer",
                EnableInMainMenu = true,
                MenuSection = "Sleep Timer",
                EmbeddedResourcePath = GetType().Namespace + ".Configuration.configPage.html"
            },
            // Config page helper (no-op — logic is inline in configPage.html)
            new PluginPageInfo
            {
                Name = "sleep-timer.js",
                EmbeddedResourcePath = GetType().Namespace + ".Configuration.sleep-timer.js"
            },
            // Client-side injection script — adds the OSD button and timer logic
            new PluginPageInfo
            {
                Name = "sleep-timer-inject.js",
                EmbeddedResourcePath = GetType().Namespace + ".Configuration.sleep-timer-inject.js"
            },
            // Auto-loader injected into Jellyfin's main HTML by the middleware;
            // checks localStorage and loads sleep-timer-inject.js if installed
            new PluginPageInfo
            {
                Name = "sleeptimer-autoloader.js",
                EmbeddedResourcePath = GetType().Namespace + ".Configuration.sleeptimer-autoloader.js"
            }
        };
    }
}