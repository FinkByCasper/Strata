using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using Microsoft.Data.SqlClient;
using Npgsql;
using Strata.Data;

namespace Strata.Server.Tests;

public static class TestDatabase
{
    public static DatabaseProvider Provider { get; } =
        DatabaseConfiguration.TryParse(Environment.GetEnvironmentVariable("STRATA_TEST_PROVIDER"), out var provider)
            ? provider
            : throw new InvalidOperationException("STRATA_TEST_PROVIDER must be sqlite, postgres or sqlserver");

    public static string AdminConnection { get; } = Environment.GetEnvironmentVariable("STRATA_TEST_CONNECTION") ?? "";

    public static bool IsSqlite => Provider == DatabaseProvider.Sqlite;

    public static string Create(string name)
    {
        switch (Provider)
        {
            case DatabaseProvider.Postgres:
                Run(new NpgsqlConnection(AdminConnection), $"CREATE DATABASE \"{name}\"");
                return new NpgsqlConnectionStringBuilder(AdminConnection) { Database = name, Pooling = false }.ConnectionString;
            case DatabaseProvider.SqlServer:
                Run(new SqlConnection(AdminConnection), $"CREATE DATABASE [{name}]");
                return new SqlConnectionStringBuilder(AdminConnection) { InitialCatalog = name, Pooling = false }.ConnectionString;
            default:
                throw new NotSupportedException();
        }
    }

    public static void Drop(string name)
    {
        switch (Provider)
        {
            case DatabaseProvider.Postgres:
                Run(new NpgsqlConnection(AdminConnection), $"DROP DATABASE IF EXISTS \"{name}\" WITH (FORCE)");
                break;
            case DatabaseProvider.SqlServer:
                Run(new SqlConnection(AdminConnection), $"IF DB_ID(N'{name}') IS NOT NULL BEGIN ALTER DATABASE [{name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{name}]; END");
                break;
        }
    }

    private static void Run(System.Data.Common.DbConnection connection, string sql)
    {
        using (connection)
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = sql;
            command.ExecuteNonQuery();
        }
    }
}

public sealed class StrataFactory : WebApplicationFactory<Program>
{
    private readonly string dir = Directory.CreateTempSubdirectory("strata-test-").FullName;
    private readonly string databaseName = $"strata_test_{Guid.NewGuid():N}";
    private readonly string? connection;

    public StrataFactory()
    {
        if (!TestDatabase.IsSqlite) connection = TestDatabase.Create(databaseName);
    }

    public string? Dist { get; init; } = "/definitely/not/here";

    public bool Auth { get; init; }

    public bool AllowSignup { get; init; } = true;

    public string? AdminEmail { get; init; }

    public int? HistoryIntervalMinutes { get; init; }

    public int? HistoryMax { get; init; }

    public int? ModelMaxMb { get; init; }

    public int? ModelMaxCount { get; init; }

    public int? ModelDiagramMaxMb { get; init; }
    public int LiveSaveDelayMs { get; init; } = 100;

    public string DatabasePath => Path.Combine(dir, "strata.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureLogging(l => l.SetMinimumLevel(LogLevel.Warning));
        if (TestDatabase.IsSqlite)
        {
            builder.UseSetting("STRATA_DB", DatabasePath);
        }
        else
        {
            builder.UseSetting("STRATA_DB_PROVIDER", TestDatabase.Provider.ToString());
            builder.UseSetting("STRATA_DB_CONNECTION", connection);
        }
        if (Dist is not null) builder.UseSetting("STRATA_DIST", Dist);
        builder.UseSetting("STRATA_AUTH", Auth ? "on" : "off");
        builder.UseSetting("STRATA_ALLOW_SIGNUP", AllowSignup ? "true" : "false");
        if (AdminEmail is not null) builder.UseSetting("STRATA_ADMIN_EMAIL", AdminEmail);
        if (HistoryIntervalMinutes is { } minutes) builder.UseSetting("STRATA_HISTORY_INTERVAL_MINUTES", minutes.ToString());
        if (ModelMaxMb is { } modelMb) builder.UseSetting("STRATA_MODEL_MAX_MB", modelMb.ToString());
        if (ModelMaxCount is { } modelCount) builder.UseSetting("STRATA_MODEL_MAX_COUNT", modelCount.ToString());
        if (ModelDiagramMaxMb is { } diagramMb) builder.UseSetting("STRATA_MODEL_DIAGRAM_MAX_MB", diagramMb.ToString());
        builder.UseSetting("STRATA_LIVE_SAVE_DELAY_MS", LiveSaveDelayMs.ToString());
        if (HistoryMax is { } max) builder.UseSetting("STRATA_HISTORY_MAX", max.ToString());
    }

    private bool disposed;

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing || disposed) return;
        disposed = true;
        SqliteConnection.ClearAllPools();
        NpgsqlConnection.ClearAllPools();
        SqlConnection.ClearAllPools();
        if (!TestDatabase.IsSqlite) TestDatabase.Drop(databaseName);
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
