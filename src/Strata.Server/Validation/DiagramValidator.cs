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

        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var n in nodes.EnumerateArray())
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
            ids.Add(n.GetProperty("id").GetString()!);
        }

        foreach (var c in connectors.EnumerateArray())
        {
            if (!Text(c, "id", 64) || !References(c, "from", ids) || !References(c, "to", ids)) return "bad connector";
            if (!OneOf(c, "route", Routes) || !OptionalText(c, "label", 200) || !OptionalText(c, "color", 32) || !OptionalText(c, "color2", 32)
                || !OptionalText(c, "subtitle", 200) || !OptionalText(c, "description", 5000))
                return "bad connector";
            if (Present(c, "flow", out var flow) && !(flow.ValueKind == JsonValueKind.String && Flows.Contains(flow.GetString()!)))
                return "bad connector";
            if (!OptionalBool(c, "arrow") || !OptionalBool(c, "arrowStart")) return "bad connector";
        }

        foreach (var z in zones.EnumerateArray())
        {
            if (!Text(z, "id", 64) || !Text(z, "label", 200) || !Vector(z, "position") || !Vector(z, "size") || !Text(z, "color", 32))
                return "bad zone";
            if ((Present(z, "labelMode", out var mode) && !IsOneOf(mode, LabelModes)) || (Present(z, "labelEdge", out var edge) && !IsOneOf(edge, LabelEdges)))
                return "bad zone label";
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

    private static bool References(JsonElement obj, string name, HashSet<string> ids) =>
        obj.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String && ids.Contains(v.GetString()!);

    private static bool Vector(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.Array || v.GetArrayLength() != 3) return false;
        foreach (var item in v.EnumerateArray())
            if (item.ValueKind != JsonValueKind.Number || !item.TryGetDouble(out var d) || !double.IsFinite(d)) return false;
        return true;
    }
}
