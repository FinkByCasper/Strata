using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Strata.Server.Tests;

public class ApiTests
{
    [Fact]
    public async Task Create_save_share_rotate_delete()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();

        var createdResponse = await http.SendJson(HttpMethod.Post, "/api/diagrams", new { name = "x" });
        Assert.Equal(HttpStatusCode.Created, createdResponse.StatusCode);
        var created = await createdResponse.Body();
        Assert.Equal(0, created.GetProperty("data").GetProperty("nodes").GetArrayLength());
        var id = created.GetProperty("id").GetString();
        var oldToken = created.GetProperty("viewToken").GetString();

        var data = Samples.WithNodes(Samples.Node());
        var saved = await (await http.SendJson(HttpMethod.Put, $"/api/diagrams/{id}", new { name = "y", data })).Body();
        Assert.Equal(1, saved.GetProperty("data").GetProperty("nodes").GetArrayLength());

        var shared = await (await http.GetAsync($"/api/shared/{oldToken}")).Body();
        Assert.Equal("y", shared.GetProperty("name").GetString());
        Assert.False(shared.TryGetProperty("id", out _), "shared payload must not leak the edit id");
        Assert.False(shared.TryGetProperty("viewToken", out _));

        var rotated = await (await http.SendJson(HttpMethod.Post, $"/api/diagrams/{id}/rotate-view-token")).Body();
        Assert.NotEqual(oldToken, rotated.GetProperty("viewToken").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync($"/api/shared/{oldToken}")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await http.DeleteAsync($"/api/diagrams/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync($"/api/diagrams/{id}")).StatusCode);
    }

    [Fact]
    public async Task Rejects_invalid_diagrams()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();

        var dangling = new { nodes = new[] { Samples.Node() }, connectors = new[] { new { id = "c", from = "nope", to = "a", route = "straight" } }, zones = Array.Empty<object>() };
        Assert.Equal(HttpStatusCode.BadRequest, (await http.SendJson(HttpMethod.Post, "/api/diagrams", new { name = "x", data = dangling })).StatusCode);

        var svgIcon = Samples.WithNodes(new { id = "a", label = "A", shape = "box", color = "#fff", position = new[] { 0, 0, 0 }, icon = "data:image/svg+xml;base64,AAAA" });
        Assert.Equal(HttpStatusCode.BadRequest, (await http.SendJson(HttpMethod.Post, "/api/diagrams", new { name = "x", data = svgIcon })).StatusCode);
    }

    [Fact]
    public async Task Without_a_built_ui_the_root_explains_where_the_web_app_is()
    {
        using var factory = new StrataFactory();
        var response = await factory.CreateClient().GetAsync("/");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("localhost:5173", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task List_is_newest_first_and_has_no_data()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        await http.SendJson(HttpMethod.Post, "/api/diagrams", new { name = "first" });
        await Task.Delay(5);
        await http.SendJson(HttpMethod.Post, "/api/diagrams", new { name = "second" });

        var list = await http.GetFromJsonAsync<JsonElement>("/api/diagrams");
        Assert.Equal(["second", "first"], list.EnumerateArray().Select(i => i.GetProperty("name").GetString()).ToArray());
        Assert.All(list.EnumerateArray(), i => Assert.False(i.TryGetProperty("data", out _)));
    }

    [Fact]
    public async Task Create_without_a_body_uses_defaults()
    {
        using var factory = new StrataFactory();
        var response = await factory.CreateClient().PostAsync("/api/diagrams", null);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("Untitled diagram", (await response.Body()).GetProperty("name").GetString());
    }

    [Fact]
    public async Task Save_requires_name_and_data()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = (await (await http.SendJson(HttpMethod.Post, "/api/diagrams")).Body()).GetProperty("id").GetString();

        var noData = await http.SendJson(HttpMethod.Put, $"/api/diagrams/{id}", new { name = "n" });
        Assert.Equal("diagram must be an object", (await noData.Body()).GetProperty("error").GetString());

        var noName = await http.SendJson(HttpMethod.Put, $"/api/diagrams/{id}", new { data = Samples.Empty });
        Assert.Equal("bad name", (await noName.Body()).GetProperty("error").GetString());

        var longName = await http.SendJson(HttpMethod.Put, $"/api/diagrams/{id}", new { name = new string('x', 201), data = Samples.Empty });
        Assert.Equal(HttpStatusCode.BadRequest, longName.StatusCode);
    }

    [Fact]
    public async Task Unknown_ids_and_tokens_are_404_with_a_json_body()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();

        foreach (var (method, url) in new[] { (HttpMethod.Get, "/api/diagrams/nope"), (HttpMethod.Put, "/api/diagrams/nope"), (HttpMethod.Delete, "/api/diagrams/nope"), (HttpMethod.Post, "/api/diagrams/nope/rotate-view-token"), (HttpMethod.Get, "/api/shared/nope"), (HttpMethod.Get, "/api/not-a-route") })
        {
            var response = await http.SendJson(method, url, new { name = "n", data = Samples.Empty });
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal("not found", (await response.Body()).GetProperty("error").GetString());
        }
    }

    [Fact]
    public async Task Malformed_json_is_a_400_and_oversized_bodies_a_413()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();

        var broken = await http.PostAsync("/api/diagrams", new StringContent("{nope", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, broken.StatusCode);
        Assert.Equal("invalid JSON", (await broken.Body()).GetProperty("error").GetString());

        var huge = await http.PostAsync("/api/diagrams", new StringContent("{\"name\":\"" + new string('x', 5 * 1024 * 1024) + "\"}", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, huge.StatusCode);
    }

    [Fact]
    public async Task Data_is_returned_exactly_as_stored()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var extra = new { nodes = Array.Empty<object>(), connectors = Array.Empty<object>(), zones = Array.Empty<object>(), camera = new { zoom = 1.5 }, unknownFutureField = "kept" };

        var id = (await (await http.SendJson(HttpMethod.Post, "/api/diagrams", new { name = "n", data = extra })).Body()).GetProperty("id").GetString();
        var data = (await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}")).GetProperty("data");

        Assert.Equal("kept", data.GetProperty("unknownFutureField").GetString());
        Assert.Equal(1.5, data.GetProperty("camera").GetProperty("zoom").GetDouble());
    }

    [Fact]
    public async Task Health_check_and_openapi_document_are_served()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();

        Assert.Equal("ok", await http.GetStringAsync("/healthz"));
        var spec = await http.GetFromJsonAsync<JsonElement>("/openapi/v1.json");
        var paths = spec.GetProperty("paths").EnumerateObject().Select(p => p.Name).ToHashSet();
        Assert.Contains("/api/diagrams/{id}", paths);
        Assert.Contains("/api/shared/{token}", paths);
    }
}
