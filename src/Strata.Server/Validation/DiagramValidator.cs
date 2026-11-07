using System.Text.Json;

namespace Strata.Server.Validation;

public static class DiagramValidator
{
    private const int MaxIcon = 400_000;

    private static readonly HashSet<string> Shapes =
    [
        "box", "cylinder", "sphere", "slab", "user", "server", "router", "accesspoint", "pc", "laptop", "phone",
        "database", "cache", "switch", "firewall", "antenna", "printer", "cloud", "container", "pyramid", "model",
    ];
    private static readonly HashSet<string> Routes = ["orthogonal", "orthogonal-z", "straight", "curved"];
    private static readonly HashSet<string> Flows = ["none", "forward", "both"];
    private static readonly HashSet<string> ArrowHeads = ["cone", "diamond", "dot", "bar"];
    private static readonly HashSet<string> FlowShapes = ["sphere", "cube", "diamond", "dash"];
    private static readonly (string Name, double Min, double Max)[] LookRanges =
        [("arrowSize", 0.5, 3), ("lineWidth", 1, 8), ("flowSize", 0.4, 3), ("flowSpeed", 0.25, 4), ("flowDensity", 0.25, 4)];
    private static readonly HashSet<string> Anchors = ["node", "zone"];
    private static readonly HashSet<string> LabelModes = ["edge", "center", "none"];
    private static readonly HashSet<string> LabelEdges = ["back", "front", "left", "right"];
    private static readonly string[] IconPrefixes =
        ["data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,", "data:image/gif;base64,"];

    public static string? Validate(JsonElement? diagram)
    {
        if (diagram is not { } d || d.ValueKind is not (JsonValueKind.Object or JsonValueKind.Array))
            return "diagram must be an object";

        if (!TryGetArray(d, "nodes", out var nodes) | !TryGetArray(d, "connectors", out var connectors) | !TryGetArray(d, "zones", out var zones))
            return "nodes, connectors and zones must be arrays";

        if (nodes.GetArrayLength() > 2000 || connectors.GetArrayLength() > 4000 || zones.GetArrayLength() > 500)
            return "diagram too large";

        var texts = new List<JsonElement>();
        if (Present(d, "labels", out var labelList))
        {
            if (labelList.ValueKind != JsonValueKind.Array) return "labels must be an array";
            if (labelList.GetArrayLength() > 1000) return "diagram too large";
            texts.AddRange(labelList.EnumerateArray());
        }

        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var n in nodes.EnumerateArray())
        {
            if (ValidateNode(n) is { } problem) return problem;
            ids.Add(n.GetProperty("id").GetString()!);
        }

        foreach (var c in connectors.EnumerateArray())
            if (ValidateConnector(c, ids.Contains) is { } problem) return problem;

        var zoneIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var z in zones.EnumerateArray())
        {
            if (ValidateZone(z) is { } problem) return problem;
            zoneIds.Add(z.GetProperty("id").GetString()!);
        }

        foreach (var text in texts)
            if (ValidateLabel(text, (type, id) => type == "node" ? ids.Contains(id) : zoneIds.Contains(id)) is { } problem) return problem;

        return Present(d, "style", out var style) ? ValidateStyle(style) : null;
    }

    /// <summary>The diagram-wide defaults: <c>{ "connector": { ...look } }</c>, where each connector can override any of the look properties.</summary>
    public static string? ValidateStyle(JsonElement style)
    {
        if (style.ValueKind != JsonValueKind.Object) return "bad style";
        return Present(style, "connector", out var connector) && (connector.ValueKind != JsonValueKind.Object || !IsLook(connector)) ? "bad style" : null;
    }

    public static string? ValidateNode(JsonElement n)
    {
        if (!Text(n, "id", 64) || !Text(n, "label", 200) || !OptionalText(n, "description", 5000) || !OptionalText(n, "subtitle", 200))
            return "bad node";
        if (!OneOf(n, "shape", Shapes) || !Vector(n, "position") || !Text(n, "color", 32))
            return "bad node";
        if (n.GetProperty("shape").GetString() == "model" && !Model(n)) return "bad model";

        if (Present(n, "icon", out var icon))
        {
            if (icon.ValueKind != JsonValueKind.String || icon.GetString()!.Length > MaxIcon) return "icon too large";
            var uri = icon.GetString()!;
            if (uri.StartsWith("data:", StringComparison.Ordinal) && !IconPrefixes.Any(p => uri.StartsWith(p, StringComparison.Ordinal)))
                return "unsupported icon type";
        }
        return null;
    }

    private static bool Model(JsonElement node)
    {
        if (!Text(node, "modelId", 64) || node.GetProperty("modelId").GetString() is not { Length: > 0 } modelId || !modelId.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-')) return false;
        if (Present(node, "modelScale", out var scale) && (scale.ValueKind != JsonValueKind.Number || !scale.TryGetDouble(out var s) || !(s is >= 0.01 and <= 100))) return false;
        if (Present(node, "modelRotation", out _) && (!Vector(node, "modelRotation") || node.GetProperty("modelRotation").EnumerateArray().Any(a => Math.Abs(a.GetDouble()) > 3600))) return false;
        return true;
    }

    public static string? ValidateConnector(JsonElement c, Func<string, bool> nodeExists)
    {
        if (!Text(c, "id", 64) || !References(c, "from", nodeExists) || !References(c, "to", nodeExists)) return "bad connector";
        if (!OneOf(c, "route", Routes) || !OptionalText(c, "label", 200) || !OptionalText(c, "color", 32) || !OptionalText(c, "color2", 32)
            || !OptionalText(c, "subtitle", 200) || !OptionalText(c, "description", 5000))
            return "bad connector";
        if (Present(c, "flow", out var flow) && !(flow.ValueKind == JsonValueKind.String && Flows.Contains(flow.GetString()!)))
            return "bad connector";
        if (!OptionalBool(c, "arrow") || !OptionalBool(c, "arrowStart") || !IsLook(c)) return "bad connector";
        return null;
    }

    private static bool IsLook(JsonElement look)
    {
        if ((Present(look, "arrowHead", out var head) && !IsOneOf(head, ArrowHeads)) || (Present(look, "flowShape", out var shape) && !IsOneOf(shape, FlowShapes)))
            return false;
        if (!OptionalText(look, "flowColor", 32) || !OptionalText(look, "flowColor2", 32)) return false;
        foreach (var (name, min, max) in LookRanges)
            if (Present(look, name, out var v) && (v.ValueKind != JsonValueKind.Number || !v.TryGetDouble(out var d) || !double.IsFinite(d) || d < min || d > max)) return false;
        return true;
    }

    /// <summary>A piece of text lying on the floor. It is either free (at <c>position</c>) or attached to a node or zone, in which case it sits at <c>attach.offset</c> from that anchor and follows it.</summary>
    public static string? ValidateLabel(JsonElement l, Func<string, string, bool> anchorExists)
    {
        if (!Text(l, "id", 64) || !Text(l, "text", 500) || !Vector(l, "position") || !OptionalText(l, "color", 32)) return "bad label";
        if (Present(l, "size", out var size) && (size.ValueKind != JsonValueKind.Number || !size.TryGetDouble(out var s) || !(s is >= 0.5 and <= 4))) return "bad label";
        if (Present(l, "rotation", out var turn) && (turn.ValueKind != JsonValueKind.Number || !turn.TryGetDouble(out var r) || !(r is >= -360 and <= 360))) return "bad label";
        if (!Present(l, "attach", out var attach)) return null;
        if (attach.ValueKind != JsonValueKind.Object || !OneOf(attach, "type", Anchors) || !Text(attach, "id", 64) || !Vector(attach, "offset")) return "bad label";
        return anchorExists(attach.GetProperty("type").GetString()!, attach.GetProperty("id").GetString()!) ? null : "bad label";
    }

    public static string? ValidateZone(JsonElement z)
    {
        if (!Text(z, "id", 64) || !Text(z, "label", 200) || !Vector(z, "position") || !Vector(z, "size") || !Text(z, "color", 32))
            return "bad zone";
        if ((Present(z, "labelMode", out var mode) && !IsOneOf(mode, LabelModes)) || (Present(z, "labelEdge", out var edge) && !IsOneOf(edge, LabelEdges)))
            return "bad zone label";
        return null;
    }

    private static bool TryGetArray(JsonElement parent, string name, out JsonElement array)
    {
        array = default;
        return parent.ValueKind == JsonValueKind.Object
            && parent.TryGetProperty(name, out array)
            && array.ValueKind == JsonValueKind.Array;
    }

    private static bool Present(JsonElement obj, string name, out JsonElement value)
    {
        value = default;
        return obj.ValueKind == JsonValueKind.Object
            && obj.TryGetProperty(name, out value)
            && value.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined);
    }

    private static bool Text(JsonElement obj, string name, int max) =>
        obj.ValueKind == JsonValueKind.Object
        && obj.TryGetProperty(name, out var v)
        && v.ValueKind == JsonValueKind.String
        && v.GetString()!.Length <= max;

    private static bool OptionalText(JsonElement obj, string name, int max) =>
        !Present(obj, name, out var v) || (v.ValueKind == JsonValueKind.String && v.GetString()!.Length <= max);

    private static bool OptionalBool(JsonElement obj, string name) =>
        !Present(obj, name, out var v) || v.ValueKind is JsonValueKind.True or JsonValueKind.False;

    private static bool OneOf(JsonElement obj, string name, HashSet<string> allowed) =>
        obj.ValueKind == JsonValueKind.Object && obj.TryGetProperty(name, out var v) && IsOneOf(v, allowed);

    private static bool IsOneOf(JsonElement v, HashSet<string> allowed) =>
        v.ValueKind == JsonValueKind.String && allowed.Contains(v.GetString()!);

    private static bool References(JsonElement obj, string name, Func<string, bool> exists) =>
        obj.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String && exists(v.GetString()!);

    private static bool Vector(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.Array || v.GetArrayLength() != 3) return false;
        foreach (var item in v.EnumerateArray())
            if (item.ValueKind != JsonValueKind.Number || !item.TryGetDouble(out var d) || !double.IsFinite(d)) return false;
        return true;
    }
}
