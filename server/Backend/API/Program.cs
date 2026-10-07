using API.Extensions;
using Services;

namespace API;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        // PORT / STRATA_DB / STRATA_DIST keep working as environment variables, like the Node server.
        var config = builder.Configuration;
        var dbFile = config["STRATA_DB"] ?? "./data/strata.db";
        var dist = config["STRATA_DIST"] ?? Path.Combine(Directory.GetCurrentDirectory(), "dist");
        if (config["PORT"] is { } port)
        {
            builder.WebHost.UseUrls($"http://*:{port}");
        }

        builder.Services.AddStrataApi(dbFile);

        var app = builder.Build();
        app.Services.EnsureStrataDatabase();

        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
        }

        app.MapGet("/healthz", () => Results.Text("ok"));
        app.MapControllers();
        app.MapStrataWebApp(dist);

        app.Run();
    }
}
