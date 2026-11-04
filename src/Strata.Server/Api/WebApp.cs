using Microsoft.Extensions.FileProviders;

namespace Strata.Server.Api;

public static class WebApp
{
    private const string NoUiPage = """
        <!doctype html><meta charset="utf-8"><title>Strata API</title>
        <body style="font:16px system-ui;max-width:560px;margin:15vh auto;padding:0 16px;line-height:1.5">
        <h2>Strata API is running</h2>
        <p>This port only serves the API. In development, open the web app at
        <a href="http://localhost:5173">http://localhost:5173</a>.</p>
        <p>To run it all from this one port, build the web app first: <code>npm run build</code> then <code>npm start</code>.</p></body>
        """;

    public static void UseWebAppFiles(this WebApplication app, string? dist)
    {
        if (dist is null) return;
        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = new PhysicalFileProvider(dist),
            OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "public, max-age=0",
        });
    }

    public static void MapWebApp(this WebApplication app, string? dist)
    {
        if (dist is null)
        {
            app.MapGet("/", () => Results.Content(NoUiPage, "text/html")).ExcludeFromDescription();
            return;
        }

        var index = Path.Combine(dist, "index.html");
        app.MapMethods("/{**path}", ["GET", "HEAD"], async (HttpContext ctx) =>
        {
            if (!ctx.Request.Path.StartsWithSegments("/embed"))
                ctx.Response.Headers.XFrameOptions = "SAMEORIGIN";
            ctx.Response.Headers.CacheControl = "public, max-age=0";
            ctx.Response.ContentType = "text/html; charset=utf-8";
            await ctx.Response.SendFileAsync(index);
        }).ExcludeFromDescription();
    }
}
