using System.Text.Json;
using Strata.Server.Validation;

namespace Strata.Server.Tests;

public class ValidatorTests
{
    private const string Node = """{"id":"a","label":"A","shape":"box","color":"#fff","position":[0,0,0]}""";

    private static string? Check(string json) => DiagramValidator.Validate(JsonDocument.Parse(json).RootElement);

    private static string Diagram(string nodes = $"[{Node}]", string connectors = "[]", string zones = "[]") =>
        $$"""{"nodes":{{nodes}},"connectors":{{connectors}},"zones":{{zones}}}""";

    [Fact]
    public void Accepts_a_minimal_and_an_empty_diagram()
    {
        Assert.Null(Check(Diagram()));
        Assert.Null(Check(Diagram("[]")));
    }

    [Theory]
    [InlineData("null")]
    [InlineData("5")]
    [InlineData("\"text\"")]
    public void Rejects_anything_that_is_not_an_object(string json) =>
        Assert.Equal("diagram must be an object", Check(json));

    [Fact]
    public void A_missing_value_is_not_an_object() =>
        Assert.Equal("diagram must be an object", DiagramValidator.Validate(null));

    [Theory]
    [InlineData("[]")]
    [InlineData("""{"nodes":[],"connectors":[]}""")]
    [InlineData("""{"nodes":{},"connectors":[],"zones":[]}""")]
    public void Requires_three_arrays(string json) =>
        Assert.Equal("nodes, connectors and zones must be arrays", Check(json));

    [Fact]
    public void Enforces_size_limits()
    {
        string Many(string item, int count) => "[" + string.Join(",", Enumerable.Repeat(item, count)) + "]";
        Assert.Equal("diagram too large", Check(Diagram(Many(Node, 2001))));
        Assert.Equal("diagram too large", Check(Diagram("[]", Many("{}", 4001))));
        Assert.Equal("diagram too large", Check(Diagram("[]", "[]", Many("{}", 501))));
        Assert.Null(Check(Diagram(Many(Node, 2000))));
    }

    [Theory]
    [InlineData("""{"id":"a","label":"A","shape":"hexagon","color":"#fff","position":[0,0,0]}""")]
    [InlineData("""{"id":"a","label":"A","shape":"box","color":"#fff","position":[0,0]}""")]
    [InlineData("""{"id":"a","label":"A","shape":"box","color":"#fff","position":[0,0,"1"]}""")]
    [InlineData("""{"id":"a","label":"A","shape":"box","color":"#fff","position":[0,0,1e999]}""")]
    [InlineData("""{"id":"a","label":"A","shape":"box","position":[0,0,0]}""")]
    [InlineData("""{"id":"a","shape":"box","color":"#fff","position":[0,0,0]}""")]
    [InlineData("""{"id":5,"label":"A","shape":"box","color":"#fff","position":[0,0,0]}""")]
    [InlineData("""{"id":"a","label":"A","description":7,"shape":"box","color":"#fff","position":[0,0,0]}""")]
    [InlineData("""7""")]
    public void Rejects_bad_nodes(string node) => Assert.Equal("bad node", Check(Diagram($"[{node}]")));

    [Fact]
    public void Node_text_limits_count_characters()
    {
        string With(string field, int length) => $$"""{"id":"a","label":"A","shape":"box","color":"#fff","position":[0,0,0],"{{field}}":"{{new string('x', length)}}"}""";
        Assert.Null(Check(Diagram($"[{With("description", 5000)}]")));
        Assert.Equal("bad node", Check(Diagram($"[{With("description", 5001)}]")));
        Assert.Null(Check(Diagram($"[{With("subtitle", 200)}]")));
        Assert.Equal("bad node", Check(Diagram($"[{With("subtitle", 201)}]")));
    }

    [Fact]
    public void Null_optional_node_fields_are_treated_as_absent() =>
        Assert.Null(Check(Diagram("""[{"id":"a","label":"A","shape":"box","color":"#fff","position":[0,0,0],"description":null,"subtitle":null,"icon":null}]""")));

    [Fact]
    public void Icons_must_be_small_raster_data_uris_or_plain_urls()
    {
        string Icon(string icon) => Diagram($$"""[{"id":"a","label":"A","shape":"box","color":"#fff","position":[0,0,0],"icon":"{{icon}}"}]""");
        Assert.Null(Check(Icon("data:image/png;base64,AAAA")));
        Assert.Null(Check(Icon("data:image/jpeg;base64,AAAA")));
        Assert.Null(Check(Icon("data:image/webp;base64,AAAA")));
        Assert.Null(Check(Icon("data:image/gif;base64,AAAA")));
        Assert.Null(Check(Icon("https://example.com/i.png")));
        Assert.Null(Check(Icon("")));
        Assert.Equal("unsupported icon type", Check(Icon("data:image/svg+xml;base64,AAAA")));
        Assert.Equal("unsupported icon type", Check(Icon("data:text/html;base64,AAAA")));
        Assert.Equal("icon too large", Check(Icon("data:image/png;base64," + new string('A', 400_000))));
        Assert.Equal("icon too large", Check(Diagram("""[{"id":"a","label":"A","shape":"box","color":"#fff","position":[0,0,0],"icon":5}]""")));
    }

    [Fact]
    public void Every_known_shape_is_accepted()
    {
        foreach (var shape in new[] { "box", "cylinder", "sphere", "slab", "user", "server", "router", "accesspoint", "pc", "laptop", "phone", "database", "cache", "switch", "firewall", "antenna", "printer", "cloud", "container", "pyramid" })
            Assert.Null(Check(Diagram($$"""[{"id":"a","label":"A","shape":"{{shape}}","color":"#fff","position":[0,0,0]}]""")));
    }

    private static string Connector(string extra = "", string route = "straight", string from = "a", string to = "a") =>
        $$"""[{"id":"c","from":"{{from}}","to":"{{to}}","route":"{{route}}"{{extra}}}]""";

    [Fact]
    public void Accepts_connectors_between_existing_nodes()
    {
        foreach (var route in new[] { "orthogonal", "orthogonal-z", "straight", "curved" })
            Assert.Null(Check(Diagram(connectors: Connector(route: route))));
        Assert.Null(Check(Diagram(connectors: Connector(",\"flow\":\"both\",\"arrow\":true,\"arrowStart\":false,\"color2\":\"#000\",\"label\":\"x\",\"subtitle\":\"y\",\"description\":\"z\""))));
    }

    [Theory]
    [InlineData("nope", "a", "straight", "")]
    [InlineData("a", "nope", "straight", "")]
    [InlineData("a", "a", "zigzag", "")]
    [InlineData("a", "a", "straight", ""","flow":"sideways" """)]
    [InlineData("a", "a", "straight", ""","flow":3 """)]
    [InlineData("a", "a", "straight", ""","arrow":"yes" """)]
    [InlineData("a", "a", "straight", ""","arrowStart":1 """)]
    [InlineData("a", "a", "straight", ""","label":5 """)]
    public void Rejects_bad_connectors(string from, string to, string route, string extra) =>
        Assert.Equal("bad connector", Check(Diagram(connectors: Connector(extra, route, from, to))));

    [Fact]
    public void Connector_endpoints_must_be_strings()
    {
        Assert.Equal("bad connector", Check(Diagram(connectors: """[{"id":"c","from":1,"to":"a","route":"straight"}]""")));
        Assert.Equal("bad connector", Check(Diagram(connectors: """[{"id":"c","to":"a","route":"straight"}]""")));
    }

    private const string Zone = """{"id":"z","label":"Z","position":[0,0,0],"size":[1,1,1],"color":"#fff"}""";

    [Fact]
    public void Validates_zones()
    {
        Assert.Null(Check(Diagram(zones: $"[{Zone}]")));
        Assert.Null(Check(Diagram(zones: $"[{Zone[..^1]},\"labelMode\":\"center\",\"labelEdge\":\"left\"}}]")));
        Assert.Equal("bad zone", Check(Diagram(zones: """[{"id":"z","position":[0,0,0],"size":[1,1,1],"color":"#fff"}]""")));
        Assert.Equal("bad zone", Check(Diagram(zones: """[{"id":"z","label":"Z","position":[0,0,0],"size":[1,1],"color":"#fff"}]""")));
        Assert.Equal("bad zone label", Check(Diagram(zones: $"[{Zone[..^1]},\"labelMode\":\"middle\"}}]")));
        Assert.Equal("bad zone label", Check(Diagram(zones: $"[{Zone[..^1]},\"labelEdge\":\"top\"}}]")));
    }
}
