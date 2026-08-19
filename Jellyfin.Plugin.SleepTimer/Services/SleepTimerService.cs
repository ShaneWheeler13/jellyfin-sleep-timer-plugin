using MediaBrowser.Controller.Session;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SleepTimer.Services;

/// <summary>
/// API controller for sleep timer operations.
/// The frontend calls these endpoints for every timer action so the server
/// stays in sync. The server monitoring loop acts as a fallback if the client
/// tab is closed or crashes.
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
            State = t.State.ToString(),
            RemainingSeconds = Math.Max(0, (int)t.Remaining.TotalSeconds),
            PopupRemainingSeconds = t.PopupRemaining.HasValue ? Math.Max(0, (int)t.PopupRemaining.Value.TotalSeconds) : (int?)null
        });

        return Ok(timers);
    }

    /// <summary>
    /// Get the sleep timer for a specific session.
    /// Used by the client on page load to sync with an existing server-side timer.
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
            State = timer.State.ToString(),
            RemainingSeconds = Math.Max(0, (int)timer.Remaining.TotalSeconds),
            PopupRemainingSeconds = timer.PopupRemaining.HasValue ? Math.Max(0, (int)timer.PopupRemaining.Value.TotalSeconds) : (int?)null
        });
    }

    /// <summary>
    /// Get the active sleep timer for the current user (by user ID).
    /// Convenience endpoint for the client to find its timer on page load.
    /// </summary>
    /// <param name="userId">The user ID.</param>
    [HttpGet]
    [Route("TimerByUser/{userId}")]
    public IActionResult GetTimerByUser(string userId)
    {
        var manager = Plugin.Instance?.TimerManager;
        if (manager == null)
        {
            return StatusCode(503, "Sleep Timer plugin not initialized");
        }

        if (!Guid.TryParse(userId, out var uid))
        {
            return BadRequest("Invalid user ID format.");
        }

        var timer = manager.GetAllTimers().FirstOrDefault(t => t.UserId == uid);
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
            State = timer.State.ToString(),
            RemainingSeconds = Math.Max(0, (int)timer.Remaining.TotalSeconds),
            PopupRemainingSeconds = timer.PopupRemaining.HasValue ? Math.Max(0, (int)timer.PopupRemaining.Value.TotalSeconds) : (int?)null
        });
    }

    /// <summary>
    /// Start a sleep timer.
    /// Called by the client when the user picks a preset duration.
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

        // Validate duration
        if (request.DurationMinutes <= 0)
        {
            return BadRequest("DurationMinutes must be greater than 0.");
        }

        // Find the session for the user
        var session = _sessionManager.Sessions
            .FirstOrDefault(s => s.UserId == request.UserId && s.NowPlayingItem != null);

        if (session == null && string.IsNullOrEmpty(request.SessionId))
        {
            return BadRequest("No active playing session found for the specified user.");
        }

        var sessionId = request.SessionId ?? session?.Id ?? string.Empty;
        var duration = request.DurationMinutes;

        manager.StartTimer(sessionId, request.UserId, duration);

        return Ok(new
        {
            message = $"Sleep timer started for {duration} minutes",
            sessionId,
            endTime = DateTime.UtcNow.AddMinutes(duration).ToString("o")
        });
    }

    /// <summary>
    /// Cancel a sleep timer.
    /// Called by the client when the user cancels the timer or dismisses the popup with "Continue".
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
    /// Called by the client when the user clicks +15m or +30m.
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

        if (request.AdditionalMinutes <= 0)
        {
            return BadRequest("AdditionalMinutes must be greater than 0.");
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

    /// <summary>
    /// Report the user's response to the "Are you still watching?" popup.
    /// Called by the client when the user clicks "Continue Watching" or "Stop Now",
    /// or when the popup countdown reaches zero.
    /// </summary>
    [HttpPost]
    [Route("PopupResponse")]
    public IActionResult PopupResponse([FromBody] PopupResponseRequest request)
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

        manager.HandlePopupResponse(request.SessionId, request.Action);
        return Ok(new { message = $"Popup response: {request.Action}" });
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

/// <summary>
/// Request to report the user's response to the popup.
/// </summary>
public class PopupResponseRequest
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
    /// Gets or sets the action: "continue" or "stop".
    /// </summary>
    public string Action { get; set; } = string.Empty;
}