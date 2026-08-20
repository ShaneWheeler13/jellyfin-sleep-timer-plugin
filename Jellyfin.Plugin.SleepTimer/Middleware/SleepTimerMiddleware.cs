using System.IO;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SleepTimer.Middleware;

/// <summary>
/// Middleware that injects the Sleep Timer auto-loader script into Jellyfin's main web page.
/// This ensures the sleep timer button persists across server restarts and page loads.
/// The injected script checks localStorage and only activates if the user has installed it.
/// </summary>
public class SleepTimerMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<SleepTimerMiddleware> _logger;

    // Inject before </body> in the main Jellyfin HTML
    // Use <script src> instead of inline script to avoid CSP blocks
    private const string InjectScriptTag = """
<script src="/web/ConfigurationPage?name=sleeptimer-autoloader.js"></script>
""";

    /// <summary>
    /// Initializes a new instance of the <see cref="SleepTimerMiddleware"/> class.
    /// </summary>
    public SleepTimerMiddleware(RequestDelegate next, ILogger<SleepTimerMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    /// <summary>
    /// Process the request and inject the auto-loader into HTML responses.
    /// </summary>
    public async Task InvokeAsync(HttpContext context)
    {
        // Capture the response body so we can modify it
        var originalBodyStream = context.Response.Body;

        // Only intercept GET requests to the main web page
        var path = context.Request.Path.Value ?? string.Empty;
        var isWebRoot = path == "/" || path == "/web" || path == "/web/" || path == "/index.html";

        if (!isWebRoot)
        {
            await _next(context);
            return;
        }

        try
        {
            // Buffer the response
            using var memoryStream = new MemoryStream();
            context.Response.Body = memoryStream;

            await _next(context);

            // Reset stream and read the response
            memoryStream.Position = 0;
            using var reader = new StreamReader(memoryStream, Encoding.UTF8);
            var html = await reader.ReadToEndAsync();

            // Only inject into HTML responses (not JSON, JS, etc.)
            var contentType = context.Response.ContentType ?? string.Empty;
            if (contentType.Contains("text/html", StringComparison.OrdinalIgnoreCase))
            {
                // Inject before </body>
                var bodyIndex = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
                if (bodyIndex >= 0)
                {
                    html = html.Substring(0, bodyIndex) + InjectScriptTag + html.Substring(bodyIndex);
                }
                else
                {
                    // No </body> tag -- append
                    html += InjectScriptTag;
                }

                // Update content length
                var modifiedBytes = Encoding.UTF8.GetBytes(html);
                context.Response.ContentLength = modifiedBytes.Length;

                // Write to the original stream
                context.Response.Body = originalBodyStream;
                await context.Response.Body.WriteAsync(modifiedBytes);
                return;
            }

            // Not HTML -- pass through unchanged
            memoryStream.Position = 0;
            context.Response.Body = originalBodyStream;
            await memoryStream.CopyToAsync(originalBodyStream);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Sleep Timer middleware error");
            // Restore the original stream — do NOT re-invoke _next
            // (the response may have already started, re-invoking causes corruption)
            context.Response.Body = originalBodyStream;
        }
    }
}