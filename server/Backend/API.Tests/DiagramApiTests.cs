using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace API.Tests;

public sealed class DiagramApiTests : IDisposable
{
    private readonly StrataApp _app = new();
    private readonly HttpClient _client;

    public DiagramApiTests()
    {
        _client = _app.CreateClient();
    }

    public void Dispose()
    {
        _client.Dispose();
        _app.Dispose();
    }

    private static object Node(string id = "a") => new
    {
        id,
        label = "A",
        description = "",
        shape = "box",
        color = "#4f8cff",
        position = new[] { 0, 0, 0 },
    };

    private static object Diagram(object[]? nodes = null, object[]? connectors = null) => new
    {
        nodes = nodes ?? [],
        connectors = connectors ?? [],
        zones = Array.Empty<object>(),
    };

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    [Fact]
    public async Task Create_save_share_rotate_delete()
    {
        var createdResponse = await _client.PostAsJsonAsync("/api/diagrams", new { name = "x" });
        Assert.Equal(HttpStatusCode.Created, createdResponse.StatusCode);
        var created = await Json(createdResponse);
        var id = created.GetProperty("id").GetString();
        var viewToken = created.GetProperty("viewToken").GetString();

        var data = created.GetProperty("data");
        Assert.Equal(0, data.GetProperty("nodes").GetArrayLength());
        Assert.Equal(0, data.GetProperty("connectors").GetArrayLength());
        Assert.Equal(0, data.GetProperty("zones").GetArrayLength());

        var saved = await Json(await _client.PutAsJsonAsync($"/api/diagrams/{id}", new { name = "y", data = Diagram([Node()]) }));
        Assert.Equal(1, saved.GetProperty("data").GetProperty("nodes").GetArrayLength());

        var shared = await Json(await _client.GetAsync($"/api/shared/{viewToken}"));
        Assert.Equal("y", shared.GetProperty("name").GetString());
        Assert.False(shared.TryGetProperty("id", out _), "shared payload must not leak the edit id");

        var rotated = await Json(await _client.PostAsync($"/api/diagrams/{id}/rotate-view-token", null));
        Assert.NotEqual(viewToken, rotated.GetProperty("viewToken").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/shared/{viewToken}")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/diagrams/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/diagrams/{id}")).StatusCode);
    }

    [Fact]
    public async Task Rejects_a_connector_that_points_at_a_missing_node()
    {
        var connector = new { id = "c", from = "nope", to = "a", route = "straight" };
        var response = await _client.PostAsJsonAsync("/api/diagrams", new { name = "x", data = Diagram([Node()], [connector]) });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Rejects_an_svg_icon()
    {
        var node = new
        {
            id = "a", label = "A", description = "", shape = "box", color = "#4f8cff",
            position = new[] { 0, 0, 0 }, icon = "data:image/svg+xml;base64,AAAA",
        };
        var response = await _client.PostAsJsonAsync("/api/diagrams", new { name = "x", data = Diagram([node]) });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Without_a_built_UI_the_root_explains_where_the_web_app_is()
    {
        var response = await _client.GetAsync("/");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("localhost:5173", await response.Content.ReadAsStringAsync());
    }
}
