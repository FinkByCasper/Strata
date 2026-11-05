using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;

namespace Strata.Server.Tests;

public class ModelTests
{
    private const string Password = "correct horse battery";

    private static object ModelNode(string id, string modelId) =>
        new { id, label = id, description = "", shape = "model", color = "#4f8cff", position = new[] { 0, 0, 0 }, modelId, modelScale = 1.5, modelRotation = new[] { 0, 90, 0 } };

    private static async Task<string> NewDiagram(HttpClient http, object? data = null) =>
        (await (await http.SendJson(HttpMethod.Post, "/api/diagrams", new { name = "models", data = data ?? Samples.Empty })).Body()).GetProperty("id").GetString()!;

    private static Task<HttpResponseMessage> Upload(HttpClient http, string diagramId, byte[] file, string? name = "robot.glb")
    {
        var content = new ByteArrayContent(file);
        content.Headers.ContentType = new MediaTypeHeaderValue("model/gltf-binary");
        return http.PostAsync($"/api/diagrams/{diagramId}/models{(name is null ? "" : "?name=" + Uri.EscapeDataString(name))}", content);
    }

    private static async Task<(HttpClient Http, string Id)> Signed(StrataFactory factory, string email)
    {
        var http = factory.CreateClient();
        var response = await http.SendJson(HttpMethod.Post, "/api/auth/register", new { email, password = Password, displayName = email.Split('@')[0] });
        http.DefaultRequestHeaders.Add("Cookie", response.Headers.GetValues("Set-Cookie").Single().Split(';')[0]);
        return (http, email);
    }

    [Fact]
    public async Task An_uploaded_model_can_be_listed_and_downloaded_unchanged()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await NewDiagram(http);
        var file = Glb.Make();

        var created = await Upload(http, id, file);

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var model = await created.Body();
        Assert.Equal("robot.glb", model.GetProperty("name").GetString());
        Assert.Equal("glb", model.GetProperty("format").GetString());
        Assert.Equal(file.Length, model.GetProperty("size").GetInt64());
        Assert.Equal(Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(file)), model.GetProperty("sha256").GetString());

        var list = await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}/models");
        Assert.Equal(1, list.GetArrayLength());
        Assert.Equal(model.GetProperty("id").GetString(), list[0].GetProperty("id").GetString());

        var download = await http.GetAsync($"/api/diagrams/{id}/models/{model.GetProperty("id").GetString()}");
        Assert.Equal("model/gltf-binary", download.Content.Headers.ContentType!.MediaType);
        Assert.Equal("nosniff", download.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal(file, await download.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task A_self_contained_gltf_is_stored_as_gltf()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await NewDiagram(http);

        var model = await (await Upload(http, id, Glb.Embedded(), "robot.gltf")).Body();

        Assert.Equal("gltf", model.GetProperty("format").GetString());
        var download = await http.GetAsync($"/api/diagrams/{id}/models/{model.GetProperty("id").GetString()}");
        Assert.Equal("model/gltf+json", download.Content.Headers.ContentType!.MediaType);
    }

    [Fact]
    public async Task Uploading_the_same_file_twice_returns_the_same_model()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await NewDiagram(http);
        var first = await Upload(http, id, Glb.Make());

        var second = await Upload(http, id, Glb.Make());

        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal((await first.Body()).GetProperty("id").GetString(), (await second.Body()).GetProperty("id").GetString());
        Assert.Equal(1, (await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}/models")).GetArrayLength());
    }

    [Fact]
    public async Task Names_are_cleaned_up()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await NewDiagram(http);

        Assert.Equal("evil.glb", (await (await Upload(http, id, Glb.Distinct(1), "C:\\Users\\me\\..\\evil.glb")).Body()).GetProperty("name").GetString());
        Assert.Equal("model", (await (await Upload(http, id, Glb.Distinct(2), null)).Body()).GetProperty("name").GetString());
        Assert.Equal(120, (await (await Upload(http, id, Glb.Distinct(3), new string('x', 500))).Body()).GetProperty("name").GetString()!.Length);
    }

    [Fact]
    public async Task Files_that_are_not_safe_models_are_refused_and_not_stored()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await NewDiagram(http);

        var html = await Upload(http, id, Encoding.UTF8.GetBytes("<html><script>alert(1)</script></html>"));
        var external = await Upload(http, id, Glb.Make(j => j["buffers"]![0]!["uri"] = "https://example.com/x.bin"));
        var empty = await Upload(http, id, []);

        Assert.All(new[] { html, external, empty }, r => Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode));
        Assert.Contains("embed", (await external.Body()).GetProperty("error").GetString());
        Assert.Equal(0, (await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}/models")).GetArrayLength());
    }

    [Fact]
    public async Task The_size_limit_is_enforced()
    {
        using var factory = new StrataFactory { ModelMaxMb = 1 };
        var http = factory.CreateClient();
        var id = await NewDiagram(http);

        var big = Glb.Make(bin: new byte[2 * 1024 * 1024], change: j => { j["buffers"]![0]!["byteLength"] = 2 * 1024 * 1024; });

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, (await Upload(http, id, big)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Upload(http, id, Glb.Make())).StatusCode);
    }

    [Fact]
    public async Task A_diagram_cannot_hold_more_than_the_allowed_number_or_size()
    {
        using var factory = new StrataFactory { ModelMaxCount = 2 };
        var http = factory.CreateClient();
        var id = await NewDiagram(http);
        await Upload(http, id, Glb.Distinct(1));
        await Upload(http, id, Glb.Distinct(2));

        var third = await Upload(http, id, Glb.Distinct(3));

        Assert.Equal(HttpStatusCode.Conflict, third.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Upload(http, id, Glb.Distinct(1))).StatusCode);

        using var small = new StrataFactory { ModelDiagramMaxMb = 0 };
        var other = small.CreateClient();
        Assert.Equal(HttpStatusCode.Conflict, (await Upload(other, await NewDiagram(other), Glb.Make())).StatusCode);
    }

    [Fact]
    public async Task Models_belong_to_one_diagram()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var one = await NewDiagram(http);
        var two = await NewDiagram(http);
        var model = (await (await Upload(http, one, Glb.Make())).Body()).GetProperty("id").GetString();

        Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync($"/api/diagrams/{two}/models/{model}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync($"/api/diagrams/{one}/models/nope")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync("/api/diagrams/ghost/models")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Upload(http, "ghost", Glb.Make())).StatusCode);
    }

    [Fact]
    public async Task Downloads_can_be_revalidated_with_the_etag()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await NewDiagram(http);
        var model = (await (await Upload(http, id, Glb.Make())).Body()).GetProperty("id").GetString();
        var first = await http.GetAsync($"/api/diagrams/{id}/models/{model}");
        var etag = first.Headers.ETag!.Tag;

        var again = new HttpRequestMessage(HttpMethod.Get, $"/api/diagrams/{id}/models/{model}");
        again.Headers.TryAddWithoutValidation("If-None-Match", etag);
        var response = await http.SendAsync(again);

        Assert.Equal(HttpStatusCode.NotModified, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task A_model_in_use_cannot_be_deleted_but_a_free_one_can()
    {
        using var factory = new StrataFactory { HistoryIntervalMinutes = 0 };
        var http = factory.CreateClient();
        var id = await NewDiagram(http);
        var used = (await (await Upload(http, id, Glb.Distinct(1))).Body()).GetProperty("id").GetString()!;
        var free = (await (await Upload(http, id, Glb.Distinct(2))).Body()).GetProperty("id").GetString()!;
        await http.SendJson(HttpMethod.Put, $"/api/diagrams/{id}", new { name = "uses it", data = Samples.WithNodes(ModelNode("m", used)) });

        Assert.Equal(HttpStatusCode.Conflict, (await http.DeleteAsync($"/api/diagrams/{id}/models/{used}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await http.DeleteAsync($"/api/diagrams/{id}/models/{free}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await http.DeleteAsync($"/api/diagrams/{id}/models/{free}")).StatusCode);

        await http.SendJson(HttpMethod.Put, $"/api/diagrams/{id}", new { name = "no longer", data = Samples.Empty });
        Assert.Equal(HttpStatusCode.Conflict, (await http.DeleteAsync($"/api/diagrams/{id}/models/{used}")).StatusCode);
    }

    [Fact]
    public async Task Deleting_a_diagram_deletes_its_models()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await NewDiagram(http);
        await Upload(http, id, Glb.Make());

        await http.DeleteAsync($"/api/diagrams/{id}");

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Strata.Data.StrataDbContext>();
        Assert.Empty(db.Models.ToList());
    }

    [Fact]
    public async Task A_view_link_can_load_the_models_of_its_own_diagram_only()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var one = await NewDiagram(http);
        var two = await NewDiagram(http);
        var model = (await (await Upload(http, one, Glb.Make())).Body()).GetProperty("id").GetString();
        var token = (await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{one}")).GetProperty("viewToken").GetString();
        var otherToken = (await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{two}")).GetProperty("viewToken").GetString();

        Assert.Equal(HttpStatusCode.OK, (await http.GetAsync($"/api/shared/{token}/models/{model}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync($"/api/shared/{otherToken}/models/{model}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync($"/api/shared/nonsense/models/{model}")).StatusCode);
    }

    [Fact]
    public async Task With_accounts_only_people_with_access_can_touch_models_and_viewers_cannot_change_them()
    {
        using var factory = new StrataFactory { Auth = true };
        var (ada, _) = await Signed(factory, "ada@example.com");
        var (bob, _) = await Signed(factory, "bob@example.com");
        var (cy, _) = await Signed(factory, "cy@example.com");
        var id = await NewDiagram(ada);
        await ada.SendJson(HttpMethod.Put, $"/api/diagrams/{id}/shares", new { email = "bob@example.com", role = "viewer" });
        await ada.SendJson(HttpMethod.Put, $"/api/diagrams/{id}/shares", new { email = "cy@example.com", role = "editor" });
        var model = (await (await Upload(ada, id, Glb.Make())).Body()).GetProperty("id").GetString();

        Assert.Equal(HttpStatusCode.OK, (await bob.GetAsync($"/api/diagrams/{id}/models/{model}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Upload(bob, id, Glb.Distinct(5))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bob.DeleteAsync($"/api/diagrams/{id}/models/{model}")).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Upload(cy, id, Glb.Distinct(6))).StatusCode);

        var stranger = (await Signed(factory, "eve@example.com")).Http;
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/diagrams/{id}/models/{model}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Upload(stranger, id, Glb.Distinct(7))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync($"/api/diagrams/{id}/models/{model}")).StatusCode);
    }

    [Fact]
    public async Task Nodes_may_use_a_model_with_scale_and_rotation()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await NewDiagram(http);
        var model = (await (await Upload(http, id, Glb.Make())).Body()).GetProperty("id").GetString()!;

        var saved = await http.SendJson(HttpMethod.Put, $"/api/diagrams/{id}", new { name = "x", data = Samples.WithNodes(ModelNode("m", model)) });

        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var node = (await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}")).GetProperty("data").GetProperty("nodes")[0];
        Assert.Equal(1.5, node.GetProperty("modelScale").GetDouble());
        Assert.Equal(90, node.GetProperty("modelRotation")[1].GetDouble());
    }

    [Theory]
    [InlineData("""{"modelId":"abc"}""", true)]
    [InlineData("""{"modelId":"abc","modelScale":0.01,"modelRotation":[0,0,0]}""", true)]
    [InlineData("""{}""", false)]
    [InlineData("""{"modelId":""}""", false)]
    [InlineData("""{"modelId":"../x"}""", false)]
    [InlineData("""{"modelId":5}""", false)]
    [InlineData("""{"modelId":"abc","modelScale":0}""", false)]
    [InlineData("""{"modelId":"abc","modelScale":1000}""", false)]
    [InlineData("""{"modelId":"abc","modelScale":"big"}""", false)]
    [InlineData("""{"modelId":"abc","modelRotation":[0,0]}""", false)]
    [InlineData("""{"modelId":"abc","modelRotation":[0,99999,0]}""", false)]
    public async Task Model_nodes_are_validated(string fields, bool ok)
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await NewDiagram(http);
        var node = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>("""{"id":"m","label":"m","shape":"model","color":"#fff","position":[0,0,0]}""")!;
        foreach (var (key, value) in JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(fields)!) node[key] = value;

        var response = await http.SendJson(HttpMethod.Put, $"/api/diagrams/{id}", new { name = "x", data = Samples.WithNodes(node) });

        Assert.Equal(ok ? HttpStatusCode.OK : HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Export_bundles_the_models_and_import_restores_them()
    {
        using var from = new StrataFactory();
        var source = from.CreateClient();
        var id = await NewDiagram(source);
        var file = Glb.Make();
        var model = (await (await Upload(source, id, file, "robot.glb")).Body()).GetProperty("id").GetString()!;
        await source.SendJson(HttpMethod.Put, $"/api/diagrams/{id}", new { name = "robots", data = Samples.WithNodes(ModelNode("m", model)) });

        var export = await source.GetFromJsonAsync<JsonElement>("/api/export");
        var bundled = export.GetProperty("diagrams")[0].GetProperty("models");
        Assert.Equal(1, bundled.GetArrayLength());
        Assert.Equal(model, bundled[0].GetProperty("id").GetString());
        Assert.Equal(file, Convert.FromBase64String(bundled[0].GetProperty("data").GetString()!));

        using var to = new StrataFactory();
        var target = to.CreateClient();
        var result = await (await target.SendJson(HttpMethod.Post, "/api/import", export)).Body();
        Assert.Equal(1, result.GetProperty("imported").GetInt32());

        var again = await target.GetAsync($"/api/diagrams/{id}/models/{model}");
        Assert.Equal(file, await again.Content.ReadAsByteArrayAsync());
        Assert.Equal("robot.glb", (await target.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}/models"))[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task An_import_with_an_unsafe_model_rejects_that_diagram_only()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var good = new { id = "good", name = "good", data = Samples.Empty, models = new[] { new { id = "m1", name = "ok.glb", data = Convert.ToBase64String(Glb.Make()) } } };
        var bad = new { id = "bad", name = "bad", data = Samples.Empty, models = new[] { new { id = "m1", name = "x.glb", data = Convert.ToBase64String(Encoding.UTF8.GetBytes("<svg/>")) } } };
        var broken = new { id = "broken", name = "broken", data = Samples.Empty, models = new[] { new { id = "m1", name = "x.glb", data = "%%%not base64" } } };
        var evilId = new { id = "evil", name = "evil", data = Samples.Empty, models = new[] { new { id = "../x", name = "x.glb", data = Convert.ToBase64String(Glb.Make()) } } };

        var result = await (await http.SendJson(HttpMethod.Post, "/api/import", new { format = "strata-export", version = 1, exportedAt = 0, diagrams = new object[] { bad, good, broken, evilId } })).Body();

        Assert.Equal(1, result.GetProperty("imported").GetInt32());
        Assert.Equal(3, result.GetProperty("rejected").GetArrayLength());
        Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync("/api/diagrams/bad")).StatusCode);
        Assert.Equal(1, (await http.GetFromJsonAsync<JsonElement>("/api/diagrams/good/models")).GetArrayLength());
    }

    [Fact]
    public async Task Overwriting_on_import_replaces_models_with_the_same_id_and_keeps_the_others()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await NewDiagram(http);
        var keep = (await (await Upload(http, id, Glb.Distinct(1))).Body()).GetProperty("id").GetString()!;
        var updated = Glb.Distinct(2);
        var file = new { format = "strata-export", version = 1, exportedAt = 0, diagrams = new object[] { new { id, name = "again", data = Samples.Empty, models = new[] { new { id = "fixed", name = "new.glb", data = Convert.ToBase64String(updated) } } } } };

        await http.SendJson(HttpMethod.Post, $"/api/import?overwrite=true", file);
        var changed = await http.GetAsync($"/api/diagrams/{id}/models/fixed");

        Assert.Equal(updated, await changed.Content.ReadAsByteArrayAsync());
        Assert.Equal(HttpStatusCode.OK, (await http.GetAsync($"/api/diagrams/{id}/models/{keep}")).StatusCode);

        var newer = Glb.Distinct(3);
        await http.SendJson(HttpMethod.Post, $"/api/import?overwrite=true", new { format = "strata-export", version = 1, exportedAt = 0, diagrams = new object[] { new { id, name = "again", data = Samples.Empty, models = new[] { new { id = "fixed", name = "newer.glb", data = Convert.ToBase64String(newer) } } } } });
        Assert.Equal(newer, await (await http.GetAsync($"/api/diagrams/{id}/models/fixed")).Content.ReadAsByteArrayAsync());
        Assert.Equal(2, (await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}/models")).GetArrayLength());
    }

    [Fact]
    public async Task Older_export_files_without_models_still_import()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();

        var result = await (await http.SendJson(HttpMethod.Post, "/api/import", new { format = "strata-export", version = 1, exportedAt = 0, diagrams = new object[] { new { id = "old", name = "old", data = Samples.Empty } } })).Body();

        Assert.Equal(1, result.GetProperty("imported").GetInt32());
    }
}
