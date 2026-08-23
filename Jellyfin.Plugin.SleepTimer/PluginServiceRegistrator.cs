using Jellyfin.Plugin.SleepTimer.Middleware;
using Jellyfin.Plugin.SleepTimer.Services;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.SleepTimer;

/// <summary>
/// Registers the Sleep Timer API controller and middleware with the
/// Jellyfin DI container.
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
/// Inserts the Sleep Timer middleware at the start of the pipeline so it
/// can intercept HTML responses before they reach the client.
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