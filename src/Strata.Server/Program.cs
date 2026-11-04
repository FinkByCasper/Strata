using Microsoft.EntityFrameworkCore;
using Strata.Data;
using Strata.Server;
using Strata.Server.Api;
using Strata.Server.Commands;
using Strata.Server.Storage;

var builder = WebApplication.CreateBuilder(args);
var settings = StrataSettings.From(builder.Configuration, builder.Environment, args);

Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(settings.DatabasePath))!);

builder.Logging.AddFilter("Microsoft.EntityFrameworkCore", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
builder.WebHost.UseUrls($"http://*:{settings.Port}");
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 4 * 1024 * 1024);
builder.Services.AddSingleton(settings);
builder.Services.AddDbContext<StrataDbContext>(o => DatabaseConfiguration.Use(o, DatabaseProvider.Sqlite, settings.ConnectionString));
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
            Console.WriteLine(Banner.Box("Strata is running", "", $"Open the app:   http://localhost:{settings.Port}", $"Data:           {settings.DatabasePath}"));
        else
            Console.WriteLine($"[api] ready on http://localhost:{settings.Port}  (API only: the web app is on http://localhost:5173)");
    });
}

await app.RunAsync();
return 0;

public partial class Program;
