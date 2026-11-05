using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Strata.Server.Commands;

namespace Strata.Server.Tests;

public class TransferTests
{
    private static async Task<string> Create(HttpClient http, string name, object? data = null) =>
        (await (await http.SendJson(HttpMethod.Post, "/api/diagrams", new { name, data = data ?? Samples.Empty })).Body()).GetProperty("id").GetString()!;

    [Fact]
    public async Task Export_then_import_into_a_fresh_server_keeps_ids_and_share_links()
    {
        using var source = new StrataFactory();
        var from = source.CreateClient();
        var id = await Create(from, "Network", Samples.WithNodes(Samples.Node()));
        var token = (await (await from.GetAsync($"/api/diagrams/{id}")).Body()).GetProperty("viewToken").GetString();

        var export = await from.GetAsync("/api/export");
        Assert.Contains("attachment", export.Content.Headers.ContentDisposition!.ToString());
        var file = await export.Body();
        Assert.Equal("strata-export", file.GetProperty("format").GetString());

        using var target = new StrataFactory();
        var to = target.CreateClient();
        var result = await (await to.SendJson(HttpMethod.Post, "/api/import", file)).Body();
        Assert.Equal(1, result.GetProperty("imported").GetInt32());

        var copy = await (await to.GetAsync($"/api/diagrams/{id}")).Body();
        Assert.Equal("Network", copy.GetProperty("name").GetString());
        Assert.Equal(token, copy.GetProperty("viewToken").GetString());
        Assert.Equal(1, copy.GetProperty("data").GetProperty("nodes").GetArrayLength());
        Assert.Equal(HttpStatusCode.OK, (await to.GetAsync($"/api/shared/{token}")).StatusCode);
    }

    [Fact]
    public async Task Importing_twice_skips_existing_ids_unless_overwrite_is_set()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await Create(http, "original");
        var file = await (await http.GetAsync("/api/export")).Body();
        await http.SendJson(HttpMethod.Put, $"/api/diagrams/{id}", new { name = "edited", data = Samples.Empty });

        var skipped = await (await http.SendJson(HttpMethod.Post, "/api/import", file)).Body();
        Assert.Equal(1, skipped.GetProperty("skipped").GetInt32());
        Assert.Equal("edited", (await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}")).GetProperty("name").GetString());

        var replaced = await (await http.SendJson(HttpMethod.Post, "/api/import?overwrite=true", file)).Body();
        Assert.Equal(1, replaced.GetProperty("replaced").GetInt32());
        Assert.Equal("original", (await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}")).GetProperty("name").GetString());
    }

    [Fact]
    public async Task Invalid_diagrams_are_reported_and_the_rest_still_import()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var file = new
        {
            format = "strata-export",
            version = 1,
            diagrams = new object[]
            {
                new { id = "good", name = "Good", data = Samples.Empty },
                new { id = "bad-data", name = "Bad", data = new { nodes = 1 } },
                new { id = "bad id!", name = "Bad id", data = Samples.Empty },
            },
        };

        var result = await (await http.SendJson(HttpMethod.Post, "/api/import", file)).Body();

        Assert.Equal(1, result.GetProperty("imported").GetInt32());
        var rejected = result.GetProperty("rejected").EnumerateArray().ToDictionary(r => r.GetProperty("id").GetString()!, r => r.GetProperty("error").GetString());
        Assert.Equal("nodes, connectors and zones must be arrays", rejected["bad-data"]);
        Assert.Equal("bad id", rejected["bad id!"]);
        Assert.Equal(HttpStatusCode.OK, (await http.GetAsync("/api/diagrams/good")).StatusCode);
    }

    [Fact]
    public async Task A_view_token_already_used_by_another_diagram_is_replaced()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var existing = await Create(http, "existing");
        var token = (await (await http.GetAsync($"/api/diagrams/{existing}")).Body()).GetProperty("viewToken").GetString();

        var file = new { format = "strata-export", version = 1, diagrams = new[] { new { id = "newcomer", viewToken = token, name = "n", data = Samples.Empty } } };
        await http.SendJson(HttpMethod.Post, "/api/import", file);

        var imported = await (await http.GetAsync("/api/diagrams/newcomer")).Body();
        Assert.NotEqual(token, imported.GetProperty("viewToken").GetString());
        Assert.Equal("existing", (await (await http.GetAsync($"/api/shared/{token}")).Body()).GetProperty("name").GetString());
    }

    [Theory]
    [InlineData("""{"hello":"world"}""")]
    [InlineData("""{"format":"other","diagrams":[]}""")]
    [InlineData("[]")]
    public async Task Files_that_are_not_exports_are_refused(string body)
    {
        using var factory = new StrataFactory();
        var response = await factory.CreateClient().PostAsync("/api/import", new StringContent(body, System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("not a Strata export file", (await response.Body()).GetProperty("error").GetString());
    }

    [Fact]
    public async Task A_beta_sqlite_file_can_be_imported_from_the_command_line()
    {
        using var factory = new StrataFactory();
        factory.CreateClient();
        var legacy = Path.Combine(Path.GetTempPath(), $"legacy-{Guid.NewGuid():N}.db");
        try
        {
            using (var connection = new SqliteConnection($"Data Source={legacy}"))
            {
                connection.Open();
                var command = connection.CreateCommand();
                command.CommandText = """
                    CREATE TABLE diagrams (id TEXT PRIMARY KEY, view_token TEXT NOT NULL UNIQUE, name TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
                    INSERT INTO diagrams VALUES ('1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed', 'AAAAAAAAAAAAAAAAAAAAAA', 'Beta diagram', '{"nodes":[],"connectors":[],"zones":[]}', 1700000000000, 1700000005000);
                    INSERT INTO diagrams VALUES ('broken', 'BBBBBBBBBBBBBBBBBBBBBB', 'Broken', '{"nodes":5}', 1, 2);
                    """;
                command.ExecuteNonQuery();
            }

            var exit = await ImportSqliteCommand.RunAsync(factory.Services, [legacy]);

            Assert.Equal(1, exit);
            var http = factory.CreateClient();
            var diagram = await http.GetFromJsonAsync<JsonElement>("/api/diagrams/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed");
            Assert.Equal("Beta diagram", diagram.GetProperty("name").GetString());
            Assert.Equal("AAAAAAAAAAAAAAAAAAAAAA", diagram.GetProperty("viewToken").GetString());
            Assert.Equal(1700000005000, diagram.GetProperty("updatedAt").GetInt64());
            Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync("/api/diagrams/broken")).StatusCode);
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            File.Delete(legacy);
        }
    }

    [Fact]
    public async Task The_import_command_explains_itself_when_the_file_is_missing()
    {
        using var factory = new StrataFactory();
        factory.CreateClient();
        Assert.Equal(2, await ImportSqliteCommand.RunAsync(factory.Services, ["/no/such/file.db"]));
    }
}

public class UpgradeTests
{
    [Fact]
    public async Task A_beta_database_file_is_adopted_in_place_and_keeps_working()
    {
        Assert.SkipUnless(TestDatabase.IsSqlite, "Beta files are SQLite files; other engines get them through import-sqlite.");
        using var factory = new StrataFactory();
        using (var connection = new SqliteConnection($"Data Source={factory.DatabasePath}"))
        {
            connection.Open();
            var command = connection.CreateCommand();
            command.CommandText = """
                CREATE TABLE diagrams (id TEXT PRIMARY KEY, view_token TEXT NOT NULL UNIQUE, name TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
                INSERT INTO diagrams VALUES ('old-one', 'CCCCCCCCCCCCCCCCCCCCCC', 'From the beta', '{"nodes":[],"connectors":[],"zones":[]}', 1, 2);
                """;
            command.ExecuteNonQuery();
        }

        var http = factory.CreateClient();

        var old = await http.GetFromJsonAsync<JsonElement>("/api/diagrams/old-one");
        Assert.Equal("From the beta", old.GetProperty("name").GetString());
        Assert.Equal(HttpStatusCode.OK, (await http.GetAsync("/api/shared/CCCCCCCCCCCCCCCCCCCCCC")).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await http.SendJson(HttpMethod.Post, "/api/diagrams", new { name = "new" })).StatusCode);
    }
}
