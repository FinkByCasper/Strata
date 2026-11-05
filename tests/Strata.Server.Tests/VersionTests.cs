using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Strata.Data;

namespace Strata.Server.Tests;

public class VersionTests
{
    private const string Password = "correct horse battery";

    private static object Nodes(int count) =>
        Samples.WithNodes(Enumerable.Range(0, count).Select(i => Samples.Node($"n{i}")).ToArray());

    private static async Task<string> Create(HttpClient http) =>
        (await (await http.SendJson(HttpMethod.Post, "/api/diagrams", new { name = "plan" })).Body()).GetProperty("id").GetString()!;

    private static Task<HttpResponseMessage> Save(HttpClient http, string id, int nodes, string name = "plan") =>
        http.SendJson(HttpMethod.Put, $"/api/diagrams/{id}", new { name, data = Nodes(nodes) });

    private static async Task<JsonElement> Versions(HttpClient http, string id) =>
        await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}/versions");

    private static async Task<HttpClient> SignUp(StrataFactory factory, string email, string name = "")
    {
        var http = factory.CreateClient();
        await http.SendJson(HttpMethod.Post, "/api/auth/register", new { email, password = Password, displayName = name });
        return http;
    }

    [Fact]
    public async Task A_save_keeps_the_state_it_replaces_but_never_an_empty_one()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await Create(http);

        await Save(http, id, 1);
        Assert.Equal(0, (await Versions(http, id)).GetArrayLength());

        await Save(http, id, 2);
        var versions = await Versions(http, id);
        Assert.Equal(1, versions.GetArrayLength());
        Assert.Equal("auto", versions[0].GetProperty("kind").GetString());
        Assert.Equal(1, versions[0].GetProperty("nodes").GetInt32());
    }

    [Fact]
    public async Task Rapid_autosaves_make_one_version_not_hundreds()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await Create(http);

        for (var i = 1; i <= 8; i++) await Save(http, id, i);

        Assert.Equal(1, (await Versions(http, id)).GetArrayLength());
    }

    [Fact]
    public async Task With_no_waiting_every_distinct_state_is_kept_and_repeats_are_not()
    {
        using var factory = new StrataFactory { HistoryIntervalMinutes = 0 };
        var http = factory.CreateClient();
        var id = await Create(http);

        await Save(http, id, 1);
        await Save(http, id, 2);
        await Save(http, id, 2);
        await Save(http, id, 3);

        var versions = await Versions(http, id);
        Assert.Equal([2, 1], versions.EnumerateArray().Select(v => v.GetProperty("nodes").GetInt32()).ToArray());
    }

    [Fact]
    public async Task A_version_says_when_its_state_was_saved_not_when_the_copy_was_made()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await Create(http);
        await Save(http, id, 1);
        var savedAt = (await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}")).GetProperty("updatedAt").GetInt64();
        await Task.Delay(30);
        await Save(http, id, 2);

        Assert.Equal(savedAt, (await Versions(http, id))[0].GetProperty("savedAt").GetInt64());
    }

    [Fact]
    public async Task A_named_version_captures_the_diagram_as_it_is_now()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await Create(http);
        await Save(http, id, 3, "before the big change");

        var created = await http.SendJson(HttpMethod.Post, $"/api/diagrams/{id}/versions", new { label = "  v1  " });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var version = await created.Body();
        Assert.Equal("manual", version.GetProperty("kind").GetString());
        Assert.Equal("v1", version.GetProperty("label").GetString());
        Assert.Equal(3, version.GetProperty("nodes").GetInt32());

        var full = await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}/versions/{version.GetProperty("id").GetString()}");
        Assert.Equal("before the big change", full.GetProperty("name").GetString());
        Assert.Equal(3, full.GetProperty("data").GetProperty("nodes").GetArrayLength());
    }

    [Fact]
    public async Task A_named_version_needs_no_body()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await Create(http);
        await Save(http, id, 1);

        var created = await http.PostAsync($"/api/diagrams/{id}/versions", null);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal(JsonValueKind.Null, (await created.Body()).GetProperty("label").ValueKind);
        Assert.Equal(HttpStatusCode.BadRequest, (await http.SendJson(HttpMethod.Post, $"/api/diagrams/{id}/versions", new { label = new string('x', 201) })).StatusCode);
    }

    [Fact]
    public async Task Restoring_replaces_the_diagram_and_can_itself_be_undone()
    {
        using var factory = new StrataFactory { HistoryIntervalMinutes = 0 };
        var http = factory.CreateClient();
        var id = await Create(http);
        await Save(http, id, 1, "first");
        await Save(http, id, 2, "second");
        await Save(http, id, 3, "third");
        var first = (await Versions(http, id)).EnumerateArray().Single(v => v.GetProperty("nodes").GetInt32() == 1).GetProperty("id").GetString();

        var restored = await http.SendJson(HttpMethod.Post, $"/api/diagrams/{id}/versions/{first}/restore");

        Assert.Equal(HttpStatusCode.OK, restored.StatusCode);
        var body = await restored.Body();
        Assert.Equal("first", body.GetProperty("name").GetString());
        Assert.Equal(1, body.GetProperty("data").GetProperty("nodes").GetArrayLength());
        var live = await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}");
        Assert.Equal("first", live.GetProperty("name").GetString());

        var undo = (await Versions(http, id)).EnumerateArray().Single(v => v.GetProperty("kind").GetString() == "restore");
        Assert.Equal("third", undo.GetProperty("name").GetString());
        await http.SendJson(HttpMethod.Post, $"/api/diagrams/{id}/versions/{undo.GetProperty("id").GetString()}/restore");
        Assert.Equal(3, (await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}")).GetProperty("data").GetProperty("nodes").GetArrayLength());
    }

    [Fact]
    public async Task Old_automatic_versions_are_pruned_but_named_ones_are_kept()
    {
        using var factory = new StrataFactory { HistoryIntervalMinutes = 0, HistoryMax = 2 };
        var http = factory.CreateClient();
        var id = await Create(http);
        await Save(http, id, 1);
        await http.SendJson(HttpMethod.Post, $"/api/diagrams/{id}/versions", new { label = "keep me" });
        for (var i = 2; i <= 6; i++) await Save(http, id, i);

        var versions = (await Versions(http, id)).EnumerateArray().ToList();
        Assert.Equal(2, versions.Count(v => v.GetProperty("kind").GetString() == "auto"));
        Assert.Contains(versions, v => v.GetProperty("label").GetString() == "keep me");
        Assert.Equal([5, 4], versions.Where(v => v.GetProperty("kind").GetString() == "auto").Select(v => v.GetProperty("nodes").GetInt32()).ToArray());
    }

    [Fact]
    public async Task Automatic_history_can_be_switched_off_while_named_versions_still_work()
    {
        using var factory = new StrataFactory { HistoryMax = 0 };
        var http = factory.CreateClient();
        var id = await Create(http);
        await Save(http, id, 1);
        await Save(http, id, 2);

        Assert.Equal(0, (await Versions(http, id)).GetArrayLength());
        await http.SendJson(HttpMethod.Post, $"/api/diagrams/{id}/versions", new { label = "manual" });
        Assert.Equal(1, (await Versions(http, id)).GetArrayLength());
    }

    [Fact]
    public async Task A_version_is_only_reachable_through_its_own_diagram()
    {
        using var factory = new StrataFactory { HistoryIntervalMinutes = 0 };
        var http = factory.CreateClient();
        var a = await Create(http);
        var b = await Create(http);
        await Save(http, a, 1); await Save(http, a, 2);
        var versionOfA = (await Versions(http, a))[0].GetProperty("id").GetString();

        Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync($"/api/diagrams/{b}/versions/{versionOfA}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await http.SendJson(HttpMethod.Post, $"/api/diagrams/{b}/versions/{versionOfA}/restore")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await http.DeleteAsync($"/api/diagrams/{b}/versions/{versionOfA}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync("/api/diagrams/nope/versions")).StatusCode);
    }

    [Fact]
    public async Task Deleting_a_diagram_deletes_its_history()
    {
        using var factory = new StrataFactory { HistoryIntervalMinutes = 0 };
        var http = factory.CreateClient();
        var id = await Create(http);
        await Save(http, id, 1); await Save(http, id, 2);
        Assert.Equal(1, (await Versions(http, id)).GetArrayLength());

        await http.DeleteAsync($"/api/diagrams/{id}");

        using var scope = factory.Services.CreateScope();
        Assert.Empty(scope.ServiceProvider.GetRequiredService<StrataDbContext>().Versions);
    }

    [Fact]
    public async Task The_owner_can_delete_a_version()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await Create(http);
        var version = await (await http.SendJson(HttpMethod.Post, $"/api/diagrams/{id}/versions", new { label = "x" })).Body();

        Assert.Equal(HttpStatusCode.NoContent, (await http.DeleteAsync($"/api/diagrams/{id}/versions/{version.GetProperty("id").GetString()}")).StatusCode);
        Assert.Equal(0, (await Versions(http, id)).GetArrayLength());
    }

    [Fact]
    public async Task Roles_decide_who_can_read_create_restore_and_delete_versions()
    {
        using var factory = new StrataFactory { Auth = true, HistoryIntervalMinutes = 0 };
        var ada = await SignUp(factory, "ada@example.com", "Ada");
        var bob = await SignUp(factory, "bob@example.com", "Bob");
        var cy = await SignUp(factory, "cy@example.com", "Cy");
        var stranger = await SignUp(factory, "stranger@example.com");
        var id = await Create(ada);
        await Save(ada, id, 1); await Save(ada, id, 2);
        await ada.SendJson(HttpMethod.Put, $"/api/diagrams/{id}/shares", new { email = "bob@example.com", role = "editor" });
        await ada.SendJson(HttpMethod.Put, $"/api/diagrams/{id}/shares", new { email = "cy@example.com", role = "viewer" });
        var version = (await Versions(ada, id))[0].GetProperty("id").GetString();

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/diagrams/{id}/versions")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.SendJson(HttpMethod.Post, $"/api/diagrams/{id}/versions/{version}/restore")).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await cy.GetAsync($"/api/diagrams/{id}/versions")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await cy.GetAsync($"/api/diagrams/{id}/versions/{version}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await cy.SendJson(HttpMethod.Post, $"/api/diagrams/{id}/versions")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await cy.SendJson(HttpMethod.Post, $"/api/diagrams/{id}/versions/{version}/restore")).StatusCode);

        Assert.Equal(HttpStatusCode.Created, (await bob.SendJson(HttpMethod.Post, $"/api/diagrams/{id}/versions", new { label = "bob's" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await bob.SendJson(HttpMethod.Post, $"/api/diagrams/{id}/versions/{version}/restore")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bob.DeleteAsync($"/api/diagrams/{id}/versions/{version}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await cy.DeleteAsync($"/api/diagrams/{id}/versions/{version}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await ada.DeleteAsync($"/api/diagrams/{id}/versions/{version}")).StatusCode);
    }

    [Fact]
    public async Task A_version_names_the_person_who_saved_that_state()
    {
        using var factory = new StrataFactory { Auth = true, HistoryIntervalMinutes = 0 };
        var ada = await SignUp(factory, "ada@example.com", "Ada");
        var bob = await SignUp(factory, "bob@example.com", "Bob");
        var id = await Create(ada);
        await ada.SendJson(HttpMethod.Put, $"/api/diagrams/{id}/shares", new { email = "bob@example.com", role = "editor" });

        await Save(ada, id, 1);
        await Save(bob, id, 2);
        await Save(ada, id, 3);

        var authors = (await Versions(ada, id)).EnumerateArray().ToDictionary(v => v.GetProperty("nodes").GetInt32(), v => v.GetProperty("authorName").GetString());
        Assert.Equal("Ada", authors[1]);
        Assert.Equal("Bob", authors[2]);
    }

    [Fact]
    public async Task History_needs_a_session_when_accounts_are_on()
    {
        using var factory = new StrataFactory { Auth = true };
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync("/api/diagrams/x/versions")).StatusCode);
    }

    [Fact]
    public async Task The_history_endpoints_are_in_the_api_description()
    {
        using var factory = new StrataFactory();
        var spec = await factory.CreateClient().GetFromJsonAsync<JsonElement>("/openapi/v1.json");

        var paths = spec.GetProperty("paths");
        Assert.True(paths.TryGetProperty("/api/diagrams/{id}/versions", out _));
        Assert.True(paths.TryGetProperty("/api/diagrams/{id}/versions/{versionId}/restore", out _));
        Assert.Contains("restore can itself be undone", paths.GetProperty("/api/diagrams/{id}/versions/{versionId}/restore").GetProperty("post").GetProperty("description").GetString());
    }
}
