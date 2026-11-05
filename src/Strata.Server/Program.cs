using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Strata.Data;
using Strata.Server;
using Strata.Server.Api;
using Strata.Server.Auth;
using Strata.Server.Commands;
using Strata.Server.Models;
using Strata.Server.Live;
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
builder.Services.AddSingleton(settings.Auth);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<LoginThrottle>();
builder.Services.AddSingleton<PasswordHasher<User>>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ActorOverride>();
builder.Services.AddScoped(sp => sp.GetRequiredService<ActorOverride>().Value ?? Actor.From(sp.GetRequiredService<IHttpContextAccessor>().HttpContext, sp.GetRequiredService<AuthSettings>()));
builder.Services.AddScoped<AccountService>();
builder.Services.AddSingleton(LiveSettings.From(builder.Configuration));
builder.Services.AddSingleton<DiagramRooms>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<DiagramRooms>());
builder.Services.AddSignalR(o => o.MaximumReceiveMessageSize = LiveSettings.MaxMessageBytes);
builder.Services.AddSingleton(HistorySettings.From(builder.Configuration));
builder.Services.AddScoped<VersionStore>();
builder.Services.AddSingleton(ModelSettings.From(builder.Configuration));
builder.Services.AddScoped<ModelStore>();
builder.Services.AddScoped<DiagramStore>();
builder.Services.AddScoped<DiagramTransfer>();
builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));
builder.Services.AddAuthentication(SessionAuthHandler.SchemeName).AddScheme<AuthenticationSchemeOptions, SessionAuthHandler>(SessionAuthHandler.SchemeName, null);
builder.Services.AddAuthorization();
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

var app = builder.Build();

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<StrataDbContext>();
    await LegacyDatabase.AdoptAsync(db);
    await db.Database.MigrateAsync();
}

if (args is ["import-sqlite", .. var rest])
    return await ImportSqliteCommand.RunAsync(app.Services, rest);

app.UseForwardedHeaders();
app.UseMiddleware<ErrorMiddleware>();
app.UseWebAppFiles(settings.DistPath);
app.UseRouting();
app.UseMiddleware<OriginCheckMiddleware>();
app.UseAuthentication();
app.UseAuthorization();

var open = app.MapGroup("/api");
var secured = app.MapGroup("/api");
if (settings.Auth.Enabled) secured.RequireAuthorization().WithMetadata(new ProducesResponseTypeMetadata(StatusCodes.Status401Unauthorized, typeof(ErrorResponse), ["application/json"]));

app.MapGet("/healthz", () => Results.Text("ok")).ExcludeFromDescription();
app.MapOpenApi();
var hubs = app.MapHub<DiagramHub>("/hubs/diagram");
if (settings.Auth.Enabled) hubs.RequireAuthorization();
open.MapAuthApi();
open.MapSharedApi();
open.MapSharedModelApi();
secured.MapDiagramApi();
secured.MapShareApi();
secured.MapVersionApi();
secured.MapModelApi();
secured.MapTransferApi();
open.Map("/{**rest}", () => Results.NotFound(new ErrorResponse("not found"))).ExcludeFromDescription();
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
