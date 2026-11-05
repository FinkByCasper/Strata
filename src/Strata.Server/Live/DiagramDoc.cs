using System.Text;
using System.Text.Json;
using Strata.Server.Api;
using Strata.Server.Validation;

namespace Strata.Server.Live;

public sealed class DiagramDoc
{
    private const int MaxBytes = JsonBody.DefaultLimit - 1024;

    private readonly record struct Entry(JsonElement Item, int Length);

    private readonly OrderedDictionary<string, Entry> nodes = new(), connectors = new(), zones = new();
    private readonly List<(string Name, JsonElement Value)> extras = [];
    private long bytes;

    public string Name { get; private set; } = "";

    public static DiagramDoc Parse(string name, string data)
    {
        var doc = new DiagramDoc { Name = name };
        using var parsed = JsonDocument.Parse(data);
        foreach (var property in parsed.RootElement.EnumerateObject())
        {
            var target = property.Name switch { "nodes" => doc.nodes, "connectors" => doc.connectors, "zones" => doc.zones, _ => null };
            if (target is null)
            {
                doc.extras.Add((property.Name, property.Value.Clone()));
                doc.bytes += property.Value.GetRawText().Length;
                continue;
            }
            foreach (var item in property.Value.EnumerateArray())
                doc.Store(target, item.GetProperty("id").GetString()!, item.Clone());
        }
        return doc;
    }

    public string ToJson()
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            foreach (var (name, value) in extras)
            {
                writer.WritePropertyName(name);
                value.WriteTo(writer);
            }
            WriteList(writer, "nodes", nodes);
            WriteList(writer, "connectors", connectors);
            WriteList(writer, "zones", zones);
            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(stream.GetBuffer(), 0, (int)stream.Length);
    }

    public JsonElement ToElement() => JsonSerializer.Deserialize<JsonElement>(ToJson());

    public bool Contains(string kind, string id) => Table(kind)?.ContainsKey(id) == true;

    public (string? Error, List<LiveOp> Accepted) Apply(IReadOnlyList<LiveOp> ops)
    {
        var undo = new Stack<Action>();
        var oldName = Name;
        var touchedConnectors = new HashSet<string>();
        var nodeDeleted = false;

        (string? Error, List<LiveOp> Accepted) Fail(string message)
        {
            while (undo.Count > 0) undo.Pop()();
            Name = oldName;
            return (message, []);
        }

        foreach (var op in ops)
        {
            switch (op.Op)
            {
                case "name":
                    if (op.Name is null || op.Name.Length > 200) return Fail("bad name");
                    Name = op.Name;
                    break;

                case "put":
                {
                    var table = Table(op.Kind);
                    if (table is null || op.Item is not { ValueKind: JsonValueKind.Object } item) return Fail("bad operation");
                    var problem = op.Kind switch
                    {
                        "node" => DiagramValidator.ValidateNode(item),
                        "zone" => DiagramValidator.ValidateZone(item),
                        _ => null,
                    };
                    if (problem is not null) return Fail(problem);
                    if (!item.TryGetProperty("id", out var idProperty) || idProperty.ValueKind != JsonValueKind.String) return Fail("bad operation");
                    var id = idProperty.GetString()!;
                    if (op.Kind == "connector") touchedConnectors.Add(id);
                    var before = table.TryGetValue(id, out var previous) ? previous : (Entry?)null;
                    Store(table, id, item);
                    undo.Push(() => Restore(table, id, before));
                    break;
                }

                case "del":
                {
                    var table = Table(op.Kind);
                    if (table is null || op.Id is null) return Fail("bad operation");
                    if (!table.TryGetValue(op.Id, out var previous)) break;
                    Remove(table, op.Id);
                    undo.Push(() => Restore(table, op.Id, previous));
                    nodeDeleted |= op.Kind == "node";
                    break;
                }

                default:
                    return Fail("bad operation");
            }
        }

        var extra = new List<LiveOp>();
        if (nodeDeleted)
        {
            foreach (var (id, entry) in connectors.ToList())
            {
                if (Has(entry.Item, "from") && Has(entry.Item, "to")) continue;
                Remove(connectors, id);
                undo.Push(() => Restore(connectors, id, entry));
                touchedConnectors.Remove(id);
                extra.Add(new LiveOp("del", "connector", id, null, null));
            }
        }

        foreach (var id in touchedConnectors)
        {
            if (!connectors.TryGetValue(id, out var entry)) continue;
            if (DiagramValidator.ValidateConnector(entry.Item, nodeId => nodes.ContainsKey(nodeId)) is { } problem) return Fail(problem);
        }

        if (nodes.Count > 2000 || connectors.Count > 4000 || zones.Count > 500) return Fail("diagram too large");
        if (bytes > MaxBytes) return Fail("diagram too large");

        return (null, [.. ops, .. extra]);

        bool Has(JsonElement connector, string end) => connector.TryGetProperty(end, out var v) && v.ValueKind == JsonValueKind.String && nodes.ContainsKey(v.GetString()!);
    }

    private OrderedDictionary<string, Entry>? Table(string? kind) => kind switch { "node" => nodes, "connector" => connectors, "zone" => zones, _ => null };

    private void Store(OrderedDictionary<string, Entry> table, string id, JsonElement item)
    {
        var entry = new Entry(item, item.GetRawText().Length);
        if (table.TryGetValue(id, out var old)) bytes -= old.Length;
        table[id] = entry;
        bytes += entry.Length;
    }

    private void Remove(OrderedDictionary<string, Entry> table, string id)
    {
        if (!table.Remove(id, out var old)) return;
        bytes -= old.Length;
    }

    private void Restore(OrderedDictionary<string, Entry> table, string id, Entry? before)
    {
        if (before is { } entry) Store(table, id, entry.Item);
        else Remove(table, id);
    }

    private static void WriteList(Utf8JsonWriter writer, string name, OrderedDictionary<string, Entry> table)
    {
        writer.WriteStartArray(name);
        foreach (var entry in table.Values) entry.Item.WriteTo(writer);
        writer.WriteEndArray();
    }
}
