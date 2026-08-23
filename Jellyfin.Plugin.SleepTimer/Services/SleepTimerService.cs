using MediaBrowser.Controller.Session;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SleepTimer.Services;

/// <summary>
/// REST API controller for sleep timer operations.
/// The frontend calls these endpoints for every timer action so the server
/// stays in sync. Endpoints: start, extend, cancel, popup response, and
/// timer queries (by session or user).
/// </summary>
[ApiController]
[Route("SleepTimer")]
public class SleepTimerService : ControllerBase
{
    private readonly ISessionManager _sessionManager;
    private readonly ILogger<SleepTimerService> _logger;

    /// <summary>
    /// Creates the controller.
    /// </summary>
    public SleepTimerService(ISessionManager sessionManager, ILogger<SleepTimerService> logger)
    {
        _sessionManager = sessionManager;
        _logger = logger;
    }

    /// <summary>
    /// Returns all active timers across all sessions.
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
    /// Returns the timer for a specific session, or 404 if none.
    /// Used by the client on page load to sync with an existing server-side timer.
    /// </summary>
    /// <param name="sessionId">Jellyfin session ID.</param>
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
    /// Returns the active timer for a user, or 404 if none.
    /// Convenience endpoint — the client uses this on load to find its timer
    /// without needing the session ID.
    /// </summary>
    /// <param name="userId">Jellyfin user ID (GUID).</param>
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
    /// Start a sleep timer for a user. If SessionId is omitted, the server
    /// auto-detects the user's active playing session.
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
    /// Cancel a timer by session ID. Called when the user cancels the timer
    /// or dismisses the popup with "Continue Watching".
    /// </summary>
    /// <param name="sessionId">Jellyfin session ID.</param>
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
    /// Add time to an existing timer. If SessionId is omitted, the server
    /// looks it up by user ID.
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
    /// Report the user's popup choice. "continue" cancels the timer;
    /// "stop" stops playback. Also called when the popup countdown reaches
    /// zero on the client side.
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
/// Request body for starting a timer.
/// </summary>
public class StartTimerRequest
{
    /// <summary>
    /// User to start the timer for.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// Optional. Auto-detected from active playing sessions if omitted.
    /// </summary>
    public string? SessionId { get; set; }

    /// <summary>
    /// Countdown length in minutes.
    /// </summary>
    public int DurationMinutes { get; set; }
}

/// <summary>
/// Request body for extending a timer.
/// </summary>
public class ExtendTimerRequest
{
    /// <summary>
    /// User whose timer should be extended.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// Optional. Auto-detected by user ID if omitted.
    /// </summary>
    public string? SessionId { get; set; }

    /// <summary>
    /// Minutes to add to the existing EndTime.
    /// </summary>
    public int AdditionalMinutes { get; set; }
}

/// <summary>
/// Request body for reporting a popup response.
/// </summary>
public class PopupResponseRequest
{
    /// <summary>
    /// User responding to the popup.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// Optional. Auto-detected by user ID if omitted.
    /// </summary>
    public string? SessionId { get; set; }

    /// <summary>
    /// "continue" (cancel timer, keep watching) or "stop" (stop playback).
    /// </summary>
    public string Action { get; set; } = string.Empty;
}