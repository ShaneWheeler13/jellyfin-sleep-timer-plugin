using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SleepTimer;

/// <summary>
/// Sleep Timer plugin. Stops playback after a user-defined duration.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    private readonly ISessionManager _sessionManager;
    private readonly ILogger<Plugin> _logger;
    private readonly SleepTimerManager _timerManager;

    /// <summary>
    /// Initializes a new instance of the <see cref="Plugin"/> class.
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
    /// Gets the singleton instance of the plugin.
    /// </summary>
    public static Plugin? Instance { get; private set; }

    /// <summary>
    /// Gets the timer manager.
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
            new PluginPageInfo
            {
                Name = "sleep-timer.js",
                EmbeddedResourcePath = GetType().Namespace + ".Configuration.sleep-timer.js"
            },
            new PluginPageInfo
            {
                Name = "sleep-timer-inject.js",
                EmbeddedResourcePath = GetType().Namespace + ".Configuration.sleep-timer-inject.js"
            }
        };
    }
}