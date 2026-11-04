using Microsoft.EntityFrameworkCore;
using Strata.Data;
using Strata.Server;
using Strata.Server.Api;
using Strata.Server.Commands;
using Strata.Server.Storage;

var builder = WebApplication.CreateBuilder(args);
var settings = StrataSettings.From(builder.Configuration, builder.Environment, args);

builder.Logging.AddFilter("Microsoft.EntityFrameworkCore", LogLevel.Warning);
// On first start EF probes a database that does not exist yet and logs the refused connection as an error; the real failure is the exception that follows.
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Database.Connection", LogLevel.None);
builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
builder.WebHost.UseUrls($"http://*:{settings.Port}");
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 4 * 1024 * 1024);
builder.Services.AddSingleton(settings);
builder.Services.AddDbContext<StrataDbContext>(o => DatabaseConfiguration.Use(o, settings.Provider, settings.ConnectionString));
builder.Services.AddScoped<DiagramStore>();
builder.Services.AddScoped<DiagramTransfer>();
builder.Services.AddOpenApi();

var app = builder.Build();

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<StrataDbContext>();
    await LegacyDatabase.AdoptAsync(db);
    await db.Database.MigrateAsync();
}

if (args is ["import-sqlite", .. var rest])
    return await ImportSqliteCommand.RunAsync(app.Services, rest);

app.UseMiddleware<ErrorMiddleware>();
app.UseWebAppFiles(settings.DistPath);
app.UseRouting();
app.MapGet("/healthz", () => Results.Text("ok")).ExcludeFromDescription();
app.MapOpenApi();
app.MapDiagramApi();
app.MapTransferApi();
app.MapWebApp(settings.DistPath);

if (!app.Environment.IsEnvironment("Testing"))
{
    app.Lifetime.ApplicationStarted.Register(() =>
    {
        if (settings.DistPath is not null && !settings.Dev)
            Console.WriteLine(Banner.Box("Strata is running", "", $"Open the app:   http://localhost:{settings.Port}", $"Data:           {settings.DatabaseLabel}"));
        else
            Console.WriteLine($"[api] ready on http://localhost:{settings.Port}  (API only: the web app is on http://localhost:5173)");
    });
}

await app.RunAsync();
return 0;

public partial class Program;
