using System.Text.Json;
using System.Text.Json.Serialization;

namespace Domain.Models;

/// <summary>JSON conventions shared by the HTTP API and the database, so the stored and the wire format match the Node server's.</summary>
public static class DiagramJson
{
    public static readonly JsonSerializerOptions Options = Create();

    public static void Configure(JsonSerializerOptions options)
    {
        options.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;   // an absent optional field stays absent
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, allowIntegerValues: false));
    }

    private static JsonSerializerOptions Create()
    {
        var options = new JsonSerializerOptions();
        Configure(options);
        return options;
    }
}
