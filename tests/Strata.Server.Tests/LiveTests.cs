using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;

namespace Strata.Server.Tests;

public sealed class LiveClient : IAsyncDisposable
{
    private readonly Dictionary<string, Channel<JsonElement[]>> channels = [];
    public HubConnection Connection { get; }

    public LiveClient(StrataFactory factory, string? cookie = null)
    {
        Connection = new HubConnectionBuilder()
            .WithUrl(new Uri(factory.Server.BaseAddress, "/hubs/diagram"), o =>
            {
                o.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                o.Transports = HttpTransportType.LongPolling;
                if (cookie is not null) o.Headers["Cookie"] = cookie;
            })
            .Build();
        foreach (var name in new[] { "Ops", "Reset", "PeerJoined", "PeerLeft" })
        {
            var channel = channels[name] = Channel.CreateUnbounded<JsonElement[]>();
            Connection.On<JsonElement>(name, a => channel.Writer.TryWrite([a]));
        }
        var cursors = channels["Cursor"] = Channel.CreateUnbounded<JsonElement[]>();
        Connection.On<string, double?, double?>("Cursor", (id, x, z) => cursors.Writer.TryWrite([JsonSerializer.SerializeToElement(new { id, x, z })]));
        foreach (var name in new[] { "Kicked", "Closed" })
        {
            var channel = channels[name] = Channel.CreateUnbounded<JsonElement[]>();
            Connection.On(name, () => channel.Writer.TryWrite([default]));
        }
    }

    public static async Task<LiveClient> Start(StrataFactory factory, string? cookie = null)
    {
        var client = new LiveClient(factory, cookie);
        await client.Connection.StartAsync(TestContext.Current.CancellationToken);
        return client;
    }

    public async Task<JsonElement> Join(string id) => await Connection.InvokeAsync<JsonElement>("Join", id);

    public Task<long> Apply(string batch, params object[] ops) => Connection.InvokeAsync<long>("Apply", batch, ops);

    public async Task<JsonElement> Next(string name, int seconds = 5)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(seconds));
        try { return (await channels[name].Reader.ReadAsync(cts.Token))[0]; }
        catch (OperationCanceledException) { throw new TimeoutException($"No '{name}' message arrived within {seconds}s"); }
    }

    public async Task<bool> Quiet(string name, int milliseconds = 400)
    {
        using var cts = new CancellationTokenSource(milliseconds);
        try { await channels[name].Reader.ReadAsync(cts.Token); return false; }
        catch (OperationCanceledException) { return true; }
    }

    public ValueTask DisposeAsync() => Connection.DisposeAsync();
}

public class LiveTests
{
    private const string Password = "correct horse battery";

    private static object Put(object node) => new { op = "put", kind = "node", item = node };

    private static object Del(string kind, string id) => new { op = "del", kind, id };

    private static object Link(string id, string from, string to) => new { op = "put", kind = "connector", item = new { id, from, to, route = "straight" } };

    private static async Task<string> NewDiagram(HttpClient http, object? data = null) =>
        (await (await http.SendJson(HttpMethod.Post, "/api/diagrams", new { name = "live", data = data ?? Samples.Empty })).Body()).GetProperty("id").GetString()!;

    private static async Task<(HttpClient Http, string Cookie)> SignUp(StrataFactory factory, string email, string name)
    {
        var http = factory.CreateClient();
        var response = await http.SendJson(HttpMethod.Post, "/api/auth/register", new { email, password = Password, displayName = name });
        return (http, response.Headers.GetValues("Set-Cookie").Single().Split(';')[0]);
    }

    private static async Task<JsonElement> Stored(HttpClient http, string id) => await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}");

    private static async Task<JsonElement> WaitStored(HttpClient http, string id, Func<JsonElement, bool> ready)
    {
        for (var i = 0; i < 60; i++)
        {
            var d = await Stored(http, id);
            if (ready(d)) return d;
            await Task.Delay(100);
        }
        throw new TimeoutException("The diagram was never saved in the expected state");
    }

    [Fact]
    public async Task Joining_returns_the_current_state_and_who_is_already_there()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await NewDiagram(http, Samples.WithNodes(Samples.Node("a")));
        await using var first = await LiveClient.Start(factory);
        await using var second = await LiveClient.Start(factory);

        var one = await first.Join(id);
        Assert.Equal("owner", one.GetProperty("role").GetString());
        Assert.Equal(1, one.GetProperty("data").GetProperty("nodes").GetArrayLength());
        Assert.Equal(0, one.GetProperty("peers").GetArrayLength());
        Assert.Equal("Guest 1", one.GetProperty("you").GetProperty("name").GetString());

        var two = await second.Join(id);
        Assert.Equal("Guest 2", two.GetProperty("you").GetProperty("name").GetString());
        Assert.Equal(1, two.GetProperty("peers").GetArrayLength());
        Assert.Equal("Guest 1", two.GetProperty("peers")[0].GetProperty("name").GetString());
        Assert.NotEqual(one.GetProperty("you").GetProperty("color").GetString(), two.GetProperty("you").GetProperty("color").GetString());

        Assert.Equal("Guest 2", (await first.Next("PeerJoined")).GetProperty("name").GetString());
    }

    [Fact]
    public async Task Leaving_is_announced_to_the_others()
    {
        using var factory = new StrataFactory();
        var id = await NewDiagram(factory.CreateClient());
        await using var stays = await LiveClient.Start(factory);
        var leaves = await LiveClient.Start(factory);
        await stays.Join(id);
        var gone = (await leaves.Join(id)).GetProperty("you").GetProperty("connectionId").GetString();

        await leaves.DisposeAsync();

        Assert.Equal(gone, (await stays.Next("PeerLeft")).GetString());
    }

    [Fact]
    public async Task Unknown_diagrams_cannot_be_joined()
    {
        using var factory = new StrataFactory();
        factory.CreateClient();
        await using var client = await LiveClient.Start(factory);

        var error = await Assert.ThrowsAsync<HubException>(() => client.Join("nope"));
        Assert.Contains("not found", error.Message);
    }

    [Fact]
    public async Task A_change_reaches_everyone_including_the_sender_in_the_same_order()
    {
        using var factory = new StrataFactory();
        var id = await NewDiagram(factory.CreateClient());
        await using var a = await LiveClient.Start(factory);
        await using var b = await LiveClient.Start(factory);
        await a.Join(id); await b.Join(id);

        var rev = await a.Apply("batch-1", Put(Samples.Node("n1")));

        var seenByB = await b.Next("Ops");
        var echoToA = await a.Next("Ops");
        Assert.Equal("batch-1", seenByB.GetProperty("batch").GetString());
        Assert.Equal(rev, seenByB.GetProperty("rev").GetInt64());
        Assert.Equal("n1", seenByB.GetProperty("ops")[0].GetProperty("item").GetProperty("id").GetString());
        Assert.Equal(seenByB.GetProperty("from").GetString(), echoToA.GetProperty("from").GetString());
        Assert.Equal("batch-1", echoToA.GetProperty("batch").GetString());

        var late = await (await LiveClient.Start(factory)).Join(id);
        Assert.Equal(1, late.GetProperty("data").GetProperty("nodes").GetArrayLength());
    }

    [Fact]
    public async Task Updating_and_deleting_entities_and_renaming_work_and_keep_order()
    {
        using var factory = new StrataFactory();
        var id = await NewDiagram(factory.CreateClient(), Samples.WithNodes(Samples.Node("a"), Samples.Node("b")));
        await using var a = await LiveClient.Start(factory);
        await a.Join(id);

        await a.Apply("1", Put(new { id = "a", label = "Renamed", shape = "box", color = "#fff", position = new[] { 3, 0, 3 } }), Del("node", "b"), new { op = "name", name = "New name" });
        await a.Apply("2", Put(Samples.Node("c")));
        await using var late = await LiveClient.Start(factory);
        var state = await late.Join(id);

        Assert.Equal("New name", state.GetProperty("name").GetString());
        var nodes = state.GetProperty("data").GetProperty("nodes").EnumerateArray().ToList();
        Assert.Equal(["a", "c"], nodes.Select(n => n.GetProperty("id").GetString()).ToArray());
        Assert.Equal("Renamed", nodes[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Invalid_changes_are_refused_and_change_nothing()
    {
        using var factory = new StrataFactory();
        var id = await NewDiagram(factory.CreateClient());
        await using var a = await LiveClient.Start(factory);
        await a.Join(id);

        await Assert.ThrowsAsync<HubException>(() => a.Apply("x", Put(new { id = "bad", label = "x", shape = "hexagon", color = "#fff", position = new[] { 0, 0, 0 } })));
        await Assert.ThrowsAsync<HubException>(() => a.Apply("x", Link("c", "ghost", "ghost")));
        await Assert.ThrowsAsync<HubException>(() => a.Apply("x", new { op = "put", kind = "wall", item = new { id = "w" } }));
        await Assert.ThrowsAsync<HubException>(() => a.Apply("x", new { op = "rename" }));
        await Assert.ThrowsAsync<HubException>(() => a.Apply("x", new { op = "name", name = new string('x', 201) }));

        var mixed = await Assert.ThrowsAsync<HubException>(() => a.Apply("x", Put(Samples.Node("fine")), Put(new { id = "bad", label = "x", shape = "hexagon", color = "#fff", position = new[] { 0, 0, 0 } })));
        Assert.Contains("bad node", mixed.Message);

        await using var look = await LiveClient.Start(factory);
        Assert.Equal(0, (await look.Join(id)).GetProperty("data").GetProperty("nodes").GetArrayLength());
    }

    [Fact]
    public async Task Diagram_wide_connector_defaults_are_shared_live_and_saved()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await NewDiagram(http);
        await using var a = await LiveClient.Start(factory);
        await using var b = await LiveClient.Start(factory);
        await a.Join(id); await b.Join(id);

        await a.Apply("s1", new { op = "style", item = new { connector = new { arrowHead = "diamond", lineWidth = 5, flowShape = "cube" } } });

        var seen = (await b.Next("Ops")).GetProperty("ops")[0];
        Assert.Equal("style", seen.GetProperty("op").GetString());
        Assert.Equal("diamond", seen.GetProperty("item").GetProperty("connector").GetProperty("arrowHead").GetString());

        var late = await (await LiveClient.Start(factory)).Join(id);
        Assert.Equal(5, late.GetProperty("data").GetProperty("style").GetProperty("connector").GetProperty("lineWidth").GetInt32());

        var stored = await WaitStored(http, id, d => d.GetProperty("data").TryGetProperty("style", out _));
        Assert.Equal("cube", stored.GetProperty("data").GetProperty("style").GetProperty("connector").GetProperty("flowShape").GetString());
    }

    [Fact]
    public async Task Bad_defaults_are_refused_and_leave_the_old_ones_in_place()
    {
        using var factory = new StrataFactory();
        var id = await NewDiagram(factory.CreateClient());
        await using var a = await LiveClient.Start(factory);
        await a.Join(id);
        await a.Apply("ok", new { op = "style", item = new { connector = new { lineWidth = 3 } } });

        await Assert.ThrowsAsync<HubException>(() => a.Apply("bad", new { op = "style", item = new { connector = new { lineWidth = 50 } } }));
        await Assert.ThrowsAsync<HubException>(() => a.Apply("worse", new { op = "style", item = new[] { 1 } }));
        await Assert.ThrowsAsync<HubException>(() => a.Apply("mixed", new { op = "style", item = new { connector = new { lineWidth = 6 } } }, new { op = "style", item = new { connector = new { arrowHead = "spike" } } }));

        await using var look = await LiveClient.Start(factory);
        Assert.Equal(3, (await look.Join(id)).GetProperty("data").GetProperty("style").GetProperty("connector").GetProperty("lineWidth").GetInt32());
    }

    [Fact]
    public async Task Connectors_may_only_join_nodes_that_exist_even_within_one_batch()
    {
        using var factory = new StrataFactory();
        var id = await NewDiagram(factory.CreateClient());
        await using var a = await LiveClient.Start(factory);
        await a.Join(id);

        await a.Apply("ok", Link("c1", "n1", "n2"), Put(Samples.Node("n1")), Put(Samples.Node("n2")));

        await using var look = await LiveClient.Start(factory);
        var data = (await look.Join(id)).GetProperty("data");
        Assert.Equal(2, data.GetProperty("nodes").GetArrayLength());
        Assert.Equal(1, data.GetProperty("connectors").GetArrayLength());
    }

    [Fact]
    public async Task Deleting_a_node_also_removes_its_connectors_for_everyone()
    {
        using var factory = new StrataFactory();
        var id = await NewDiagram(factory.CreateClient());
        await using var a = await LiveClient.Start(factory);
        await using var b = await LiveClient.Start(factory);
        await a.Join(id); await b.Join(id);
        await a.Apply("1", Put(Samples.Node("n1")), Put(Samples.Node("n2")), Link("c1", "n1", "n2"));
        await b.Next("Ops");

        await a.Apply("2", Del("node", "n1"));

        var ops = (await b.Next("Ops")).GetProperty("ops").EnumerateArray().Select(o => (o.GetProperty("op").GetString(), o.GetProperty("kind").GetString(), o.GetProperty("id").GetString())).ToList();
        Assert.Contains(("del", "node", "n1"), ops);
        Assert.Contains(("del", "connector", "c1"), ops);
        var state = await (await LiveClient.Start(factory)).Join(id);
        Assert.Equal(0, state.GetProperty("data").GetProperty("connectors").GetArrayLength());
    }

    [Fact]
    public async Task Two_people_changing_the_same_thing_end_up_with_the_same_result()
    {
        using var factory = new StrataFactory();
        var id = await NewDiagram(factory.CreateClient(), Samples.WithNodes(Samples.Node("a")));
        await using var a = await LiveClient.Start(factory);
        await using var b = await LiveClient.Start(factory);
        await a.Join(id); await b.Join(id);
        object Label(string text) => Put(new { id = "a", label = text, shape = "box", color = "#fff", position = new[] { 0, 0, 0 } });

        await Task.WhenAll(a.Apply("from-a", Label("A wins?")), b.Apply("from-b", Label("B wins?")));

        var order = new List<string>();
        foreach (var client in new[] { a, b })
        {
            var labels = new List<string>();
            for (var i = 0; i < 2; i++) labels.Add((await client.Next("Ops")).GetProperty("ops")[0].GetProperty("item").GetProperty("label").GetString()!);
            order.Add(string.Join(">", labels));
        }
        Assert.Equal(order[0], order[1]);
        var final = (await (await LiveClient.Start(factory)).Join(id)).GetProperty("data").GetProperty("nodes")[0].GetProperty("label").GetString();
        Assert.Equal(order[0].Split('>')[1], final);
    }

    [Fact]
    public async Task Batches_and_diagrams_have_size_limits()
    {
        using var factory = new StrataFactory();
        var id = await NewDiagram(factory.CreateClient());
        await using var a = await LiveClient.Start(factory);
        await a.Join(id);

        var tooMany = Enumerable.Range(0, 501).Select(i => Put(Samples.Node($"n{i}"))).ToArray();
        Assert.Contains("too many", (await Assert.ThrowsAsync<HubException>(() => a.Apply("x", tooMany))).Message);

        var icon = "data:image/png;base64," + new string('A', 390_000);
        for (var i = 0; i < 10; i++)
            await a.Apply($"icon{i}", Put(new { id = $"i{i}", label = "x", shape = "box", color = "#fff", position = new[] { i, 0, 0 }, icon }));
        Assert.Contains("too large", (await Assert.ThrowsAsync<HubException>(() => a.Apply("last", Put(new { id = "i10", label = "x", shape = "box", color = "#fff", position = new[] { 11, 0, 0 }, icon })))).Message);
    }

    [Fact]
    public async Task Changes_are_saved_to_the_database_shortly_afterwards()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await NewDiagram(http);
        await using var a = await LiveClient.Start(factory);
        await a.Join(id);

        await a.Apply("1", Put(Samples.Node("saved")), new { op = "name", name = "Saved live" });

        var stored = await WaitStored(http, id, d => d.GetProperty("data").GetProperty("nodes").GetArrayLength() == 1);
        Assert.Equal("Saved live", stored.GetProperty("name").GetString());
        Assert.Equal("saved", stored.GetProperty("data").GetProperty("nodes")[0].GetProperty("id").GetString());
    }

    [Fact]
    public async Task The_last_person_leaving_saves_immediately()
    {
        using var factory = new StrataFactory { LiveSaveDelayMs = 60_000 };
        var http = factory.CreateClient();
        var id = await NewDiagram(http);
        var a = await LiveClient.Start(factory);
        await a.Join(id);
        await a.Apply("1", Put(Samples.Node("before-leaving")));
        Assert.Equal(0, (await Stored(http, id)).GetProperty("data").GetProperty("nodes").GetArrayLength());

        await a.DisposeAsync();

        await WaitStored(http, id, d => d.GetProperty("data").GetProperty("nodes").GetArrayLength() == 1);
    }

    [Fact]
    public async Task Live_saves_feed_version_history()
    {
        using var factory = new StrataFactory { HistoryIntervalMinutes = 0 };
        var http = factory.CreateClient();
        var id = await NewDiagram(http, Samples.WithNodes(Samples.Node("original")));
        await using var a = await LiveClient.Start(factory);
        await a.Join(id);

        await a.Apply("1", Put(Samples.Node("second")));
        await WaitStored(http, id, d => d.GetProperty("data").GetProperty("nodes").GetArrayLength() == 2);

        var versions = await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}/versions");
        Assert.Equal(1, versions.GetArrayLength());
        Assert.Equal(1, versions[0].GetProperty("nodes").GetInt32());
    }

    [Fact]
    public async Task Saving_through_the_normal_api_resets_everyone_in_the_room()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await NewDiagram(http);
        await using var a = await LiveClient.Start(factory);
        await a.Join(id);

        await http.SendJson(HttpMethod.Put, $"/api/diagrams/{id}", new { name = "from rest", data = Samples.WithNodes(Samples.Node("r1"), Samples.Node("r2")) });

        var reset = await a.Next("Reset");
        Assert.Equal("from rest", reset.GetProperty("name").GetString());
        Assert.Equal(2, reset.GetProperty("data").GetProperty("nodes").GetArrayLength());
        await using var late = await LiveClient.Start(factory);
        Assert.Equal(2, (await late.Join(id)).GetProperty("data").GetProperty("nodes").GetArrayLength());
    }

    [Fact]
    public async Task Restoring_a_version_resets_the_room()
    {
        using var factory = new StrataFactory { HistoryIntervalMinutes = 0 };
        var http = factory.CreateClient();
        var id = await NewDiagram(http, Samples.WithNodes(Samples.Node("old")));
        await http.SendJson(HttpMethod.Put, $"/api/diagrams/{id}", new { name = "newer", data = Samples.Empty });
        var version = (await http.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}/versions"))[0].GetProperty("id").GetString();
        await using var a = await LiveClient.Start(factory);
        await a.Join(id);

        await http.SendJson(HttpMethod.Post, $"/api/diagrams/{id}/versions/{version}/restore");

        Assert.Equal(1, (await a.Next("Reset")).GetProperty("data").GetProperty("nodes").GetArrayLength());
    }

    [Fact]
    public async Task Deleting_a_diagram_closes_its_room()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var id = await NewDiagram(http);
        await using var a = await LiveClient.Start(factory);
        await a.Join(id);

        await http.DeleteAsync($"/api/diagrams/{id}");

        await a.Next("Closed");
        await Assert.ThrowsAsync<HubException>(() => a.Apply("x", Put(Samples.Node("n"))));
        await Assert.ThrowsAsync<HubException>(() => a.Join(id));
    }

    [Fact]
    public async Task Cursors_go_to_the_others_but_not_back_to_the_sender()
    {
        using var factory = new StrataFactory();
        var id = await NewDiagram(factory.CreateClient());
        await using var a = await LiveClient.Start(factory);
        await using var b = await LiveClient.Start(factory);
        var me = (await a.Join(id)).GetProperty("you").GetProperty("connectionId").GetString();
        await b.Join(id);

        await a.Connection.InvokeAsync("Cursor", 2.5, -1.0);

        var seen = await b.Next("Cursor");
        Assert.Equal(me, seen.GetProperty("id").GetString());
        Assert.Equal(2.5, seen.GetProperty("x").GetDouble());
        Assert.Equal(-1.0, seen.GetProperty("z").GetDouble());
        Assert.True(await a.Quiet("Cursor"));
    }

    [Fact]
    public async Task People_with_accounts_appear_under_their_own_names()
    {
        using var factory = new StrataFactory { Auth = true };
        var (ada, adaCookie) = await SignUp(factory, "ada@example.com", "Ada");
        var (_, bobCookie) = await SignUp(factory, "bob@example.com", "Bob");
        var id = await NewDiagram(ada);
        await ada.SendJson(HttpMethod.Put, $"/api/diagrams/{id}/shares", new { email = "bob@example.com", role = "editor" });
        await using var a = await LiveClient.Start(factory, adaCookie);
        await using var b = await LiveClient.Start(factory, bobCookie);

        Assert.Equal("Ada", (await a.Join(id)).GetProperty("you").GetProperty("name").GetString());
        var joined = await b.Join(id);
        Assert.Equal("Bob", joined.GetProperty("you").GetProperty("name").GetString());
        Assert.Equal("editor", joined.GetProperty("role").GetString());
        Assert.Equal("Ada", joined.GetProperty("peers")[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task Only_people_with_access_can_join_and_viewers_cannot_change_anything()
    {
        using var factory = new StrataFactory { Auth = true };
        var (ada, adaCookie) = await SignUp(factory, "ada@example.com", "Ada");
        var (_, cyCookie) = await SignUp(factory, "cy@example.com", "Cy");
        var (_, strangerCookie) = await SignUp(factory, "stranger@example.com", "Stranger");
        var id = await NewDiagram(ada);
        await ada.SendJson(HttpMethod.Put, $"/api/diagrams/{id}/shares", new { email = "cy@example.com", role = "viewer" });
        await using var owner = await LiveClient.Start(factory, adaCookie);
        await using var viewer = await LiveClient.Start(factory, cyCookie);
        await using var stranger = await LiveClient.Start(factory, strangerCookie);
        await owner.Join(id);

        Assert.Contains("not found", (await Assert.ThrowsAsync<HubException>(() => stranger.Join(id))).Message);

        var join = await viewer.Join(id);
        Assert.Equal("viewer", join.GetProperty("role").GetString());
        Assert.False(join.GetProperty("you").GetProperty("canEdit").GetBoolean());
        Assert.Contains("read-only", (await Assert.ThrowsAsync<HubException>(() => viewer.Apply("x", Put(Samples.Node("n"))))).Message);

        await owner.Apply("1", Put(Samples.Node("live-for-viewer")));
        Assert.Equal("live-for-viewer", (await viewer.Next("Ops")).GetProperty("ops")[0].GetProperty("item").GetProperty("id").GetString());
    }

    [Fact]
    public async Task Connecting_without_a_session_is_refused_when_accounts_are_on()
    {
        using var factory = new StrataFactory { Auth = true };
        factory.CreateClient();
        await Assert.ThrowsAnyAsync<Exception>(() => LiveClient.Start(factory));
    }

    [Fact]
    public async Task Withdrawing_access_kicks_the_person_out_of_the_room()
    {
        using var factory = new StrataFactory { Auth = true };
        var (ada, adaCookie) = await SignUp(factory, "ada@example.com", "Ada");
        var (bob, bobCookie) = await SignUp(factory, "bob@example.com", "Bob");
        var id = await NewDiagram(ada);
        await ada.SendJson(HttpMethod.Put, $"/api/diagrams/{id}/shares", new { email = "bob@example.com", role = "editor" });
        await using var a = await LiveClient.Start(factory, adaCookie);
        await using var b = await LiveClient.Start(factory, bobCookie);
        await a.Join(id); await b.Join(id);
        var bobId = (await ada.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}/shares"))[0].GetProperty("userId").GetString();

        await ada.DeleteAsync($"/api/diagrams/{id}/shares/{bobId}");

        await b.Next("Kicked");
        Assert.Contains("join", (await Assert.ThrowsAsync<HubException>(() => b.Apply("x", Put(Samples.Node("n"))))).Message);
        Assert.Contains("not found", (await Assert.ThrowsAsync<HubException>(() => b.Join(id))).Message);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync($"/api/diagrams/{id}")).StatusCode);
    }

    [Fact]
    public async Task Changing_a_role_makes_the_person_rejoin_with_the_new_one()
    {
        using var factory = new StrataFactory { Auth = true };
        var (ada, adaCookie) = await SignUp(factory, "ada@example.com", "Ada");
        var (_, bobCookie) = await SignUp(factory, "bob@example.com", "Bob");
        var id = await NewDiagram(ada);
        await ada.SendJson(HttpMethod.Put, $"/api/diagrams/{id}/shares", new { email = "bob@example.com", role = "editor" });
        await using var a = await LiveClient.Start(factory, adaCookie);
        await using var b = await LiveClient.Start(factory, bobCookie);
        await a.Join(id); await b.Join(id);

        await ada.SendJson(HttpMethod.Put, $"/api/diagrams/{id}/shares", new { email = "bob@example.com", role = "viewer" });

        await b.Next("Kicked");
        Assert.False((await b.Join(id)).GetProperty("you").GetProperty("canEdit").GetBoolean());
    }

    [Fact]
    public async Task Edits_made_in_two_rooms_stay_separate()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var one = await NewDiagram(http);
        var two = await NewDiagram(http);
        await using var a = await LiveClient.Start(factory);
        await using var b = await LiveClient.Start(factory);
        await a.Join(one); await b.Join(two);

        await a.Apply("1", Put(Samples.Node("only-in-one")));

        Assert.True(await b.Quiet("Ops"));
        await using var look = await LiveClient.Start(factory);
        Assert.Equal(0, (await look.Join(two)).GetProperty("data").GetProperty("nodes").GetArrayLength());
    }

    [Fact]
    public async Task Unknown_top_level_fields_survive_live_editing()
    {
        using var factory = new StrataFactory { LiveSaveDelayMs = 50 };
        var http = factory.CreateClient();
        var id = await NewDiagram(http, new { nodes = Array.Empty<object>(), connectors = Array.Empty<object>(), zones = Array.Empty<object>(), camera = new { zoom = 2.5 } });
        await using var a = await LiveClient.Start(factory);
        await a.Join(id);

        await a.Apply("1", Put(Samples.Node("n")));

        var stored = await WaitStored(http, id, d => d.GetProperty("data").GetProperty("nodes").GetArrayLength() == 1);
        Assert.Equal(2.5, stored.GetProperty("data").GetProperty("camera").GetProperty("zoom").GetDouble());
    }
}
