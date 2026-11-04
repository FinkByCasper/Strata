using System.Text.Json;

namespace Strata.Server.Api;

public static class JsonBody
{
    public const int DefaultLimit = 4 * 1024 * 1024;

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement;

    public static async Task<byte[]> ReadBytesAsync(HttpRequest request, long limit, CancellationToken ct)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await request.Body.ReadAsync(chunk, ct)) > 0)
        {
            if (buffer.Length + read > limit) throw new ApiException(413, "request entity too large");
            buffer.Write(chunk, 0, read);
        }
        return buffer.ToArray();
    }

    public static async Task<JsonElement> ReadObjectAsync(HttpRequest request, CancellationToken ct)
    {
        if (!request.HasJsonContentType()) return EmptyObject;

        var bytes = await ReadBytesAsync(request, DefaultLimit, ct);
        if (bytes.Length == 0) return EmptyObject;

        try
        {
            using var doc = JsonDocument.Parse(bytes);
            return doc.RootElement.ValueKind switch
            {
                JsonValueKind.Object => doc.RootElement.Clone(),
                JsonValueKind.Array => EmptyObject,
                _ => throw new ApiException(400, "invalid JSON"),
            };
        }
        catch (JsonException)
        {
            throw new ApiException(400, "invalid JSON");
        }
    }
}
