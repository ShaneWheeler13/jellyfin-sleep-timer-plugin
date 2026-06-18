using MediaBrowser.Controller.Session;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SleepTimer.Services;

/// <summary>
/// API controller for sleep timer operations.
/// </summary>
[ApiController]
[Route("SleepTimer")]
public class SleepTimerService : ControllerBase
{
    private readonly ISessionManager _sessionManager;
    private readonly ILogger<SleepTimerService> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="SleepTimerService"/> class.
    /// </summary>
    public SleepTimerService(ISessionManager sessionManager, ILogger<SleepTimerService> logger)
    {
        _sessionManager = sessionManager;
        _logger = logger;
    }

    /// <summary>
    /// Get plugin configuration.
    /// </summary>
    [HttpGet]
    [Route("Config")]
    public IActionResult GetConfig()
    {
        var config = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        return Ok(new
        {
            config.DefaultDurationMinutes,
            config.ShowNotification,
            config.NotificationLeadTimeSeconds
        });
    }

    /// <summary>
    /// Save plugin configuration.
    /// </summary>
    [HttpPost]
    [Route("Config")]
    public IActionResult SaveConfig([FromBody] PluginConfiguration config)
    {
        var plugin = Plugin.Instance;
        if (plugin == null)
        {
            return StatusCode(503, "Sleep Timer plugin not initialized");
        }

        plugin.Configuration.DefaultDurationMinutes = config.DefaultDurationMinutes;
        plugin.Configuration.ShowNotification = config.ShowNotification;
        plugin.Configuration.NotificationLeadTimeSeconds = config.NotificationLeadTimeSeconds;
        plugin.SaveConfiguration();

        return Ok(new { message = "Configuration saved" });
    }

    /// <summary>
    /// Get all active sleep timers.
    /// </summary>
    [HttpGet]
    [Route("Timers")]
    public IActionResult GetTimers()
    {
        var manager = Plugin.Instance?.TimerManager;
        if (manager == null)
        {
            return StatusCode(503, "Sleep Timer plugin not initialized");
        }

        var timers = manager.GetAllTimers().Select(t => new
        {
            t.SessionId,
            t.UserId,
            StartTime = t.StartTime.ToString("o"),
            EndTime = t.EndTime.ToString("o"),
            t.DurationMinutes,
            RemainingSeconds = Math.Max(0, (int)t.Remaining.TotalSeconds),
            t.NotifyBeforeStop
        });

        return Ok(timers);
    }

    /// <summary>
    /// Get the sleep timer for a specific session.
    /// </summary>
    /// <param name="sessionId">The session ID.</param>
    [HttpGet]
    [Route("Timer/{sessionId}")]
    public IActionResult GetTimer(string sessionId)
    {
        var manager = Plugin.Instance?.TimerManager;
        if (manager == null)
        {
            return StatusCode(503, "Sleep Timer plugin not initialized");
        }

        var timer = manager.GetTimer(sessionId);
        if (timer == null)
        {
            return NotFound();
        }

        return Ok(new
        {
            timer.SessionId,
            timer.UserId,
            StartTime = timer.StartTime.ToString("o"),
            EndTime = timer.EndTime.ToString("o"),
            timer.DurationMinutes,
            RemainingSeconds = Math.Max(0, (int)timer.Remaining.TotalSeconds),
            timer.NotifyBeforeStop
        });
    }

    /// <summary>
    /// Start a sleep timer.
    /// </summary>
    [HttpPost]
    [Route("Start")]
    public IActionResult StartTimer([FromBody] StartTimerRequest request)
    {
        var manager = Plugin.Instance?.TimerManager;
        if (manager == null)
        {
            return StatusCode(503, "Sleep Timer plugin not initialized");
        }

        var config = Plugin.Instance?.Configuration ?? new PluginConfiguration();

        // Find the session for the user
        var session = _sessionManager.Sessions
            .FirstOrDefault(s => s.UserId == request.UserId && s.NowPlayingItem != null);

        if (session == null && string.IsNullOrEmpty(request.SessionId))
        {
            return BadRequest("No active playing session found for the specified user.");
        }

        var sessionId = request.SessionId ?? session?.Id ?? string.Empty;
        var duration = request.DurationMinutes > 0 ? request.DurationMinutes : config.DefaultDurationMinutes;
        var notify = request.NotifyBeforeStop ?? config.ShowNotification;
        var notifyLead = request.NotifyLeadTimeSeconds ?? config.NotificationLeadTimeSeconds;

        manager.StartTimer(sessionId, request.UserId, duration, notify, notifyLead);

        return Ok(new
        {
            message = $"Sleep timer started for {duration} minutes",
            sessionId,
            endTime = DateTime.UtcNow.AddMinutes(duration).ToString("o")
        });
    }

    /// <summary>
    /// Cancel a sleep timer.
    /// </summary>
    /// <param name="sessionId">The session ID.</param>
    [HttpDelete]
    [Route("Cancel/{sessionId}")]
    public IActionResult CancelTimer(string sessionId)
    {
        var manager = Plugin.Instance?.TimerManager;
        if (manager == null)
        {
            return StatusCode(503, "Sleep Timer plugin not initialized");
        }

        manager.CancelTimer(sessionId);
        return Ok(new { message = "Sleep timer cancelled" });
    }

    /// <summary>
    /// Extend a sleep timer.
    /// </summary>
    [HttpPost]
    [Route("Extend")]
    public IActionResult ExtendTimer([FromBody] ExtendTimerRequest request)
    {
        var manager = Plugin.Instance?.TimerManager;
        if (manager == null)
        {
            return StatusCode(503, "Sleep Timer plugin not initialized");
        }

        if (string.IsNullOrEmpty(request.SessionId))
        {
            // Try to find session by user ID
            var session = _sessionManager.Sessions
                .FirstOrDefault(s => s.UserId == request.UserId);

            request.SessionId = session?.Id ?? string.Empty;
        }

        if (string.IsNullOrEmpty(request.SessionId))
        {
            return BadRequest("No active session found for the specified user.");
        }

        manager.ExtendTimer(request.SessionId, request.AdditionalMinutes);
        return Ok(new { message = $"Sleep timer extended by {request.AdditionalMinutes} minutes" });
    }
}

/// <summary>
/// Request to start a sleep timer.
/// </summary>
public class StartTimerRequest
{
    /// <summary>
    /// Gets or sets the user ID.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// Gets or sets the session ID (optional, auto-detected if not provided).
    /// </summary>
    public string? SessionId { get; set; }

    /// <summary>
    /// Gets or sets the duration in minutes.
    /// </summary>
    public int DurationMinutes { get; set; }

    /// <summary>
    /// Gets or sets whether to show a notification before stopping.
    /// </summary>
    public bool? NotifyBeforeStop { get; set; }

    /// <summary>
    /// Gets or sets the notification lead time in seconds.
    /// </summary>
    public int? NotifyLeadTimeSeconds { get; set; }
}

/// <summary>
/// Request to extend a sleep timer.
/// </summary>
public class ExtendTimerRequest
{
    /// <summary>
    /// Gets or sets the user ID.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// Gets or sets the session ID (optional, auto-detected if not provided).
    /// </summary>
    public string? SessionId { get; set; }

    /// <summary>
    /// Gets or sets the additional minutes to add.
    /// </summary>
    public int AdditionalMinutes { get; set; }
}