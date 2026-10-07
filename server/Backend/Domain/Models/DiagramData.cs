using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Domain.Models;

public class DiagramData : IValidatableObject
{
    [MaxLength(2000, ErrorMessage = "diagram too large, too many Nodes")] public required List<DiagramNode> Nodes { get; set; }
    [MaxLength(4000, ErrorMessage = "diagram too large, too many Connections")] public required List<DiagramConnector> Connectors { get; set; }
    [MaxLength(500, ErrorMessage = "diagram too large, too many Zones")] public required List<DiagramZone> Zones { get; set; }

    /// <summary>Fields this server does not know about, kept so they round-trip untouched.</summary>
    [JsonExtensionData] public Dictionary<string, JsonElement>? Extra { get; set; }

    public static DiagramData Empty()
    {
        return new DiagramData { Nodes = [], Connectors = [], Zones = [] };
    }

    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (Nodes.Contains(null!))
        {
            yield return new ValidationResult("bad node", [nameof(Nodes)]);
            yield break;
        }

        if (Zones.Contains(null!))
        {
            yield return new ValidationResult("bad zone", [nameof(Zones)]);
            yield break;
        }

        if (Connectors.Contains(null!))
        {
            yield return new ValidationResult("bad connector", [nameof(Connectors)]);
            yield break;
        }

        // Every connector must start and end at a node that exists.
        var nodeIds = new HashSet<string>();
        foreach (var node in Nodes)
        {
            nodeIds.Add(node.Id);
        }

        foreach (var connector in Connectors)
        {
            if (!nodeIds.Contains(connector.From) || !nodeIds.Contains(connector.To))
            {
                yield return new ValidationResult("bad connector: from and to must refer to existing nodes", [nameof(Connectors)]);
                yield break;
            }
        }
    }
}
