using System.Buffers.Binary;
using System.Text;
using System.Text.Json.Nodes;

namespace Strata.Server.Tests;

public static class Glb
{
    public const string Triangle = """
        {"asset":{"version":"2.0"},"scene":0,"scenes":[{"nodes":[0]}],"nodes":[{"mesh":0}],
         "meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],
         "accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3","min":[0,0,0],"max":[1,1,0]}],
         "bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":36}],
         "buffers":[{"byteLength":36}]}
        """;

    public static byte[] Make(Action<JsonNode>? change = null, byte[]? bin = null, bool withBin = true)
    {
        var json = JsonNode.Parse(Triangle)!;
        change?.Invoke(json);
        return Pack(json.ToJsonString(), withBin ? bin ?? new byte[36] : null);
    }

    public static byte[] Pack(string json, byte[]? bin)
    {
        var text = Encoding.UTF8.GetBytes(json);
        var jsonPadded = new byte[(text.Length + 3) / 4 * 4];
        Array.Fill(jsonPadded, (byte)' ');
        text.CopyTo(jsonPadded, 0);
        var binPadded = bin is null ? null : new byte[(bin.Length + 3) / 4 * 4];
        bin?.CopyTo(binPadded!, 0);

        var total = 12 + 8 + jsonPadded.Length + (binPadded is null ? 0 : 8 + binPadded.Length);
        var file = new byte[total];
        BinaryPrimitives.WriteUInt32LittleEndian(file, 0x46546C67);
        BinaryPrimitives.WriteUInt32LittleEndian(file.AsSpan(4), 2);
        BinaryPrimitives.WriteUInt32LittleEndian(file.AsSpan(8), (uint)total);
        BinaryPrimitives.WriteUInt32LittleEndian(file.AsSpan(12), (uint)jsonPadded.Length);
        BinaryPrimitives.WriteUInt32LittleEndian(file.AsSpan(16), 0x4E4F534A);
        jsonPadded.CopyTo(file, 20);
        if (binPadded is not null)
        {
            var at = 20 + jsonPadded.Length;
            BinaryPrimitives.WriteUInt32LittleEndian(file.AsSpan(at), (uint)binPadded.Length);
            BinaryPrimitives.WriteUInt32LittleEndian(file.AsSpan(at + 4), 0x004E4942);
            binPadded.CopyTo(file, at + 8);
        }
        return file;
    }

    public static byte[] Embedded(Action<JsonNode>? change = null)
    {
        var json = JsonNode.Parse(Triangle)!;
        json["buffers"]![0]!["uri"] = "data:application/octet-stream;base64," + Convert.ToBase64String(new byte[36]);
        change?.Invoke(json);
        return Encoding.UTF8.GetBytes(json.ToJsonString());
    }

    public static byte[] Distinct(int seed) => Make(j => j["asset"]!["generator"] = $"test-{seed}");
}
