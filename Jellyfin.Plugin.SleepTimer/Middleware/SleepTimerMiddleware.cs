using System.IO;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SleepTimer.Middleware;

/// <summary>
/// Middleware that injects the Sleep Timer auto-loader script into Jellyfin's
/// main HTML page response. The auto-loader checks localStorage and only loads
/// the full inject script if the user has installed the button on this device.
/// This persists the sleep timer across server restarts and page reloads.
/// </summary>
public class SleepTimerMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<SleepTimerMiddleware> _logger;

    // Injected before </body>. Uses <script src> (not inline) to avoid CSP blocks.
    private const string InjectScriptTag = """
<script src="/web/ConfigurationPage?name=sleeptimer-autoloader.js"></script>
""";

    /// <summary>
    /// Creates the middleware.
    /// </summary>
    public SleepTimerMiddleware(RequestDelegate next, ILogger<SleepTimerMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    /// <summary>
    /// Intercepts HTML responses to the root/web path and injects the auto-loader
    /// script tag before the closing body tag. Non-HTML and non-root responses pass
    /// through unchanged.
    /// 
    /// Jellyfin 12.x may serve the web client from different paths than 10.x.
    /// This matcher covers the known 10.x paths plus additional 12.x patterns:
    /// - Root: /, /index.html
    /// - Web: /web, /web/, /web/index.html
    /// - SPA fallback: any /web/*.html (Jellyfin SPA reloads)
    /// - 12.x: /web/route served as HTML by SPA fallback middleware
    /// </summary>
    public async Task InvokeAsync(HttpContext context)
    {
        // Capture the response body so we can modify it
        var originalBodyStream = context.Response.Body;

        // Only intercept GET requests to the main web entry points.
        var path = context.Request.Path.Value ?? string.Empty;
        var method = context.Request.Method ?? string.Empty;

        // Skip non-GET requests entirely
        if (!string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase))
        {
            await _next(context);
            return;
        }

        var isWebRoot = path == "/" ||
                        path == "/web" ||
                        path == "/web/" ||
                        path == "/index.html" ||
                        path == "/web/index.html" ||
                        (path.StartsWith("/web/", StringComparison.OrdinalIgnoreCase) &&
                         path.EndsWith(".html", StringComparison.OrdinalIgnoreCase));

        // Jellyfin 12.x SPA fallback: /web/<route> without .html extension
        // is served as the index HTML by the SPA middleware. Match these
        // only when the request looks like a page navigation (not an API call).
        // We check that there's no file extension and no API segment.
        if (!isWebRoot && path.StartsWith("/web/", StringComparison.OrdinalIgnoreCase))
        {
            var segment = path.AsSpan("/web/".Length);
            // Skip if it contains a dot (file extension) or starts with api
            if (!segment.Contains('.') &&
                !segment.StartsWith("api", StringComparison.OrdinalIgnoreCase) &&
                !segment.StartsWith("ConfigurationPage", StringComparison.OrdinalIgnoreCase))
            {
                // Will be validated by content-type check after response
                isWebRoot = true;
            }
        }

        if (!isWebRoot)
        {
            await _next(context);
            return;
        }

        try
        {
            // Buffer the response so we can modify the HTML
            using var memoryStream = new MemoryStream();
            context.Response.Body = memoryStream;

            await _next(context);

            // Reset stream and read the response body
            memoryStream.Position = 0;
            using var reader = new StreamReader(memoryStream, Encoding.UTF8);
            var html = await reader.ReadToEndAsync();

            // Only modify HTML responses — this filters out API calls, static
            // assets, and other non-page responses that matched the path pattern
            var contentType = context.Response.ContentType ?? string.Empty;
            if (contentType.Contains("text/html", StringComparison.OrdinalIgnoreCase))
            {
                // Inject before </body>, or append if no </body> tag
                var bodyIndex = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
                if (bodyIndex >= 0)
                {
                    html = html.Substring(0, bodyIndex) + InjectScriptTag + html.Substring(bodyIndex);
                }
                else
                {
                    html += InjectScriptTag;
                }

                // Update content length and write the modified HTML
                var modifiedBytes = Encoding.UTF8.GetBytes(html);
                context.Response.ContentLength = modifiedBytes.Length;

                context.Response.Body = originalBodyStream;
                await context.Response.Body.WriteAsync(modifiedBytes);
                return;
            }

            // Not HTML — pass through unchanged
            memoryStream.Position = 0;
            context.Response.Body = originalBodyStream;
            await memoryStream.CopyToAsync(originalBodyStream);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Sleep Timer middleware error");
            // Restore the original stream. Do NOT re-invoke _next —
            // the response may have partially started and re-invoking
            // would corrupt it.
            context.Response.Body = originalBodyStream;
        }
    }
}