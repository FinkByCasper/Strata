using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Domain.Models;

public class DiagramConnector
{
    [StringLength(64)] public required string Id { get; set; }

    /// <summary>Id of the node this connector starts at.</summary>
    public required string From { get; set; }

    /// <summary>Id of the node this connector ends at.</summary>
    public required string To { get; set; }

    public Route Route { get; set; }
    public Flow? Flow { get; set; }
    public bool? Arrow { get; set; }
    public bool? ArrowStart { get; set; }

    /// <summary>Line style, e.g. "solid" or "dashed". Not restricted, as before.</summary>
    public string? Line { get; set; }

    [StringLength(200)] public string? Label { get; set; }
    [StringLength(200)] public string? Subtitle { get; set; }
    [StringLength(5000)] public string? Description { get; set; }
    [StringLength(32)] public string? Color { get; set; }
    [StringLength(32)] public string? Color2 { get; set; }

    /// <summary>Fields this server does not know about, kept so they round-trip untouched.</summary>
    [JsonExtensionData] public Dictionary<string, JsonElement>? Extra { get; set; }
}
