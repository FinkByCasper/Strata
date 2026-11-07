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
    public void Accepts_every_arrow_and_flow_style_within_its_range()
    {
        foreach (var head in new[] { "cone", "diamond", "dot", "bar" })
            Assert.Null(Check(Diagram(connectors: Connector($$""","arrowHead":"{{head}}" """))));
        foreach (var shape in new[] { "sphere", "cube", "diamond", "dash" })
            Assert.Null(Check(Diagram(connectors: Connector($$""","flowShape":"{{shape}}" """))));
        Assert.Null(Check(Diagram(connectors: Connector(""","arrowSize":0.5,"lineWidth":8,"flowSize":3,"flowSpeed":0.25,"flowDensity":4,"flowColor":"#fff","flowColor2":"#000" """))));
    }

    [Theory]
    [InlineData(""","arrowHead":"spike" """)]
    [InlineData(""","arrowHead":3 """)]
    [InlineData(""","flowShape":"star" """)]
    [InlineData(""","arrowSize":0.1 """)]
    [InlineData(""","arrowSize":3.5 """)]
    [InlineData(""","lineWidth":0 """)]
    [InlineData(""","lineWidth":9 """)]
    [InlineData(""","flowSize":"big" """)]
    [InlineData(""","flowSpeed":5 """)]
    [InlineData(""","flowDensity":0 """)]
    [InlineData(""","flowColor":5 """)]
    public void Rejects_arrow_and_flow_styles_that_are_not_allowed(string extra) =>
        Assert.Equal("bad connector", Check(Diagram(connectors: Connector(extra))));

    [Fact]
    public void Accepts_diagram_wide_connector_defaults_and_rejects_bad_ones()
    {
        static string With(string style) => $$"""{"nodes":[],"connectors":[],"zones":[],"style":{{style}}}""";
        Assert.Null(Check(With("""{"connector":{"arrowHead":"dot","arrowSize":1.5,"lineWidth":4,"flowShape":"dash","flowSpeed":2}}""")));
        Assert.Null(Check(With("{}")));
        Assert.Null(Check(With("""{"connector":{}}""")));
        Assert.Equal("bad style", Check(With("[]")));
        Assert.Equal("bad style", Check(With("3")));
        Assert.Equal("bad style", Check(With("""{"connector":"thick"}""")));
        Assert.Equal("bad style", Check(With("""{"connector":{"lineWidth":99}}""")));
        Assert.Equal("bad style", Check(With("""{"connector":{"arrowHead":"spike"}}""")));
    }

    private static string Labelled(string label, string zone = "") =>
        $$"""{"nodes":[{{Node}}],"connectors":[],"zones":[{{zone}}],"labels":[{{label}}]}""";

    private const string AZone = """{"id":"z","label":"Z","position":[0,0,0],"size":[4,0,4],"color":"#fff"}""";

    [Fact]
    public void Accepts_free_and_attached_text_labels()
    {
        Assert.Null(Check(Labelled("""{"id":"t","text":"Hello","position":[1,0,2]}""")));
        Assert.Null(Check(Labelled("""{"id":"t","text":"","position":[1,0,2],"size":4,"rotation":-90,"color":"#abc"}""")));
        Assert.Null(Check(Labelled("""{"id":"t","text":"On a node","position":[1,0,2],"attach":{"type":"node","id":"a","offset":[1,0,-1]}}""")));
        Assert.Null(Check(Labelled("""{"id":"t","text":"On a zone","position":[1,0,2],"attach":{"type":"zone","id":"z","offset":[0,0,0]}}""", AZone)));
        Assert.Null(Check("""{"nodes":[],"connectors":[],"zones":[]}"""));
    }

    [Theory]
    [InlineData("""{"id":"t","text":5,"position":[0,0,0]}""")]
    [InlineData("""{"id":"t","position":[0,0,0]}""")]
    [InlineData("""{"id":"t","text":"x"}""")]
    [InlineData("""{"id":"t","text":"x","position":[0,0]}""")]
    [InlineData("""{"id":"t","text":"x","position":[0,0,0],"size":0.1}""")]
    [InlineData("""{"id":"t","text":"x","position":[0,0,0],"size":9}""")]
    [InlineData("""{"id":"t","text":"x","position":[0,0,0],"rotation":400}""")]
    [InlineData("""{"id":"t","text":"x","position":[0,0,0],"color":7}""")]
    [InlineData("""{"id":"t","text":"x","position":[0,0,0],"attach":"a"}""")]
    [InlineData("""{"id":"t","text":"x","position":[0,0,0],"attach":{"type":"connector","id":"a","offset":[0,0,0]}}""")]
    [InlineData("""{"id":"t","text":"x","position":[0,0,0],"attach":{"type":"node","id":"ghost","offset":[0,0,0]}}""")]
    [InlineData("""{"id":"t","text":"x","position":[0,0,0],"attach":{"type":"zone","id":"a","offset":[0,0,0]}}""")]
    [InlineData("""{"id":"t","text":"x","position":[0,0,0],"attach":{"type":"node","id":"a"}}""")]
    public void Rejects_bad_text_labels(string label) => Assert.Equal("bad label", Check(Labelled(label)));

    [Fact]
    public void Labels_must_be_a_list_of_limited_length()
    {
        Assert.Equal("labels must be an array", Check("""{"nodes":[],"connectors":[],"zones":[],"labels":{}}"""));
        var many = string.Join(",", Enumerable.Range(0, 1001).Select(i => $$"""{"id":"t{{i}}","text":"x","position":[0,0,0]}"""));
        Assert.Equal("diagram too large", Check(Labelled(many)));
    }

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
