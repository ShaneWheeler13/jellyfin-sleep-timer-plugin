using Jellyfin.Plugin.SleepTimer.Middleware;
using Jellyfin.Plugin.SleepTimer.Services;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.SleepTimer;

/// <summary>
/// Register Sleep Timer services.
/// </summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<SleepTimerService>();

        // Register middleware via IStartupFilter so it runs in the pipeline
        serviceCollection.AddTransient<IStartupFilter, SleepTimerStartupFilter>();
    }
}

/// <summary>
/// Startup filter that registers the Sleep Timer middleware in the request pipeline.
/// </summary>
public class SleepTimerStartupFilter : IStartupFilter
{
    /// <inheritdoc />
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        return app =>
        {
            // Add our middleware before the rest of the pipeline
            app.UseMiddleware<SleepTimerMiddleware>();
            next(app);
        };
    }
}