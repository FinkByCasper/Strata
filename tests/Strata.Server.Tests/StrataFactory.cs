using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;

namespace Strata.Server.Tests;

public sealed class StrataFactory : WebApplicationFactory<Program>
{
    private readonly string dir = Directory.CreateTempSubdirectory("strata-test-").FullName;

    public string? Dist { get; init; } = "/definitely/not/here";

    public string DatabasePath => Path.Combine(dir, "strata.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureLogging(l => l.SetMinimumLevel(LogLevel.Warning));
        builder.UseSetting("STRATA_DB", DatabasePath);
        if (Dist is not null) builder.UseSetting("STRATA_DIST", Dist);
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing) return;
        SqliteConnection.ClearAllPools();
        try { Directory.Delete(dir, true); } catch (IOException) { }
    }
}

public static class Samples
{
    public static readonly object Empty = new { nodes = Array.Empty<object>(), connectors = Array.Empty<object>(), zones = Array.Empty<object>() };

    public static object Node(string id = "a") => new { id, label = id.ToUpperInvariant(), description = "", shape = "box", color = "#4f8cff", position = new[] { 0, 0, 0 } };

    public static object WithNodes(params object[] nodes) => new { nodes, connectors = Array.Empty<object>(), zones = Array.Empty<object>() };
}

public static class HttpExtensions
{
    public static Task<HttpResponseMessage> SendJson(this HttpClient http, HttpMethod method, string url, object? body = null) =>
        http.SendAsync(new HttpRequestMessage(method, url) { Content = JsonContent.Create(body ?? new { }) });

    public static async Task<JsonElement> Body(this HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>());
}
