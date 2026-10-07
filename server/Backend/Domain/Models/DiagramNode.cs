using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Domain.Models;

public class DiagramNode : IValidatableObject
{
    private const int MaxIcon = 400_000;
    private static readonly string[] ImageTypes = ["png", "jpeg", "webp", "gif"];

    [StringLength(64)] public required string Id { get; set; }
    [StringLength(200)] public required string Label { get; set; }
    [StringLength(200)] public string? Subtitle { get; set; }
    [StringLength(5000)] public string? Description { get; set; }
    public Shape Shape { get; set; }
    [Length(3, 3)] public required double[] Position { get; set; }
    [StringLength(32)] public required string Color { get; set; }

    /// <summary>An emoji or text, or a small base64 image as a data: URI. Always written, as null when unset.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    [StringLength(MaxIcon, ErrorMessage = "icon too large")]
    public string? Icon { get; set; }

    /// <summary>Fields this server does not know about, kept so they round-trip untouched.</summary>
    [JsonExtensionData] public Dictionary<string, JsonElement>? Extra { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (Icon is null || !Icon.StartsWith("data:", StringComparison.Ordinal))
        {
            yield break;
        }

        var allowed = false;
        foreach (var type in ImageTypes)
        {
            if (Icon.StartsWith($"data:image/{type};base64,", StringComparison.Ordinal))
            {
                allowed = true;
            }
        }

        if (!allowed)
        {
            yield return new ValidationResult("unsupported icon type", [nameof(Icon)]);
        }
    }
}
