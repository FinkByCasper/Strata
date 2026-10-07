using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Domain.Models;

public class DiagramZone
{
    [StringLength(64)] public required string Id { get; set; }
    [StringLength(200)] public required string Label { get; set; }
    [Length(3, 3)] public required double[] Position { get; set; }
    [Length(3, 3)] public required double[] Size { get; set; }
    [StringLength(32)] public required string Color { get; set; }
    public LabelMode? LabelMode { get; set; }
    public LabelEdge? LabelEdge { get; set; }

    /// <summary>Fields this server does not know about, kept so they round-trip untouched.</summary>
    [JsonExtensionData] public Dictionary<string, JsonElement>? Extra { get; set; }
}
