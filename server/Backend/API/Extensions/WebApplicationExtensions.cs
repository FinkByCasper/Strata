using Microsoft.Extensions.FileProviders;

namespace API.Extensions;

public static class WebApplicationExtensions
{
    private const string ApiOnlyPage = """
        <!doctype html><meta charset="utf-8"><title>Strata API</title>
        <body style="font:16px system-ui;max-width:560px;margin:15vh auto;padding:0 16px;line-height:1.5">
        <h2>Strata API is running</h2>
        <p>This port only serves the API. In development, open the web app at
        <a href="http://localhost:5173">http://localhost:5173</a>.</p></body>
        """;

    /// <summary>Serves the built web app from <paramref name="dist"/>, or an explanation page when it has not been built.</summary>
    public static void MapStrataWebApp(this WebApplication app, string dist)
    {
        if (!Directory.Exists(dist))
        {
            // No built web app next to the server (normal during dev): explain where the UI lives.
            app.MapGet("/", () => Results.Content(ApiOnlyPage, "text/html"));
            return;
        }

        var files = new PhysicalFileProvider(dist);
        app.UseStaticFiles(new StaticFileOptions { FileProvider = files });

        // Single-page app: any other route gets index.html.
        app.MapFallback(async context =>
        {
            // Allow embedding only on the dedicated embed route.
            if (!context.Request.Path.StartsWithSegments("/embed"))
            {
                context.Response.Headers.XFrameOptions = "SAMEORIGIN";
            }

            context.Response.ContentType = "text/html";
            await context.Response.SendFileAsync(files.GetFileInfo("index.html"));
        });
    }
}
