using System.Buffers.Binary;
using System.Text.Json;
using Strata.Data;

namespace Strata.Server.Models;

public static class GltfValidator
{
    public const int MaxVertices = 3_000_000;

    private const uint GlbMagic = 0x46546C67;
    private const uint JsonChunk = 0x4E4F534A;
    private const uint BinChunk = 0x004E4942;

    // Extensions a viewer that has no Draco, KTX2 or Meshopt decoders can still render. Anything else that is *required* would fail to load.
    private static readonly HashSet<string> RequiredExtensions =
        ["KHR_mesh_quantization", "KHR_texture_transform", "KHR_materials_unlit", "KHR_materials_emissive_strength", "KHR_materials_ior", "KHR_materials_specular", "KHR_materials_clearcoat", "KHR_materials_sheen", "KHR_materials_transmission", "KHR_materials_volume"];

    private static readonly HashSet<string> BufferTypes = ["application/octet-stream", "application/gltf-buffer"];
    private static readonly HashSet<string> ImageTypes = ["image/png", "image/jpeg", "image/webp"];

    public static string? Check(byte[] file, out ModelFormat format)
    {
        format = ModelFormat.Glb;
        if (file.Length < 12) return "not a glTF model";

        ReadOnlySpan<byte> json;
        ReadOnlySpan<byte> bin = default;
        var hasBin = false;

        if (BinaryPrimitives.ReadUInt32LittleEndian(file) == GlbMagic)
        {
            if (BinaryPrimitives.ReadUInt32LittleEndian(file.AsSpan(4)) != 2) return "only glTF 2.0 is supported";
            if (BinaryPrimitives.ReadUInt32LittleEndian(file.AsSpan(8)) != file.Length) return "the file is truncated or has extra data";
            if (!NextChunk(file, 12, out var type, out var chunk, out var next) || type != JsonChunk) return "the file has no JSON chunk";
            json = chunk;
            if (next < file.Length)
            {
                if (!NextChunk(file, next, out type, out chunk, out next) || type != BinChunk || next != file.Length) return "the file has unsupported chunks";
                bin = chunk;
                hasBin = true;
            }
        }
        else
        {
            format = ModelFormat.Gltf;
            json = file;
        }

        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(json.ToArray(), new JsonDocumentOptions { MaxDepth = 32 });
        }
        catch (JsonException)
        {
            return "not a glTF model";
        }

        using (doc) return CheckDocument(doc.RootElement, format, hasBin ? bin : null);
    }

    private static string? CheckDocument(JsonElement root, ModelFormat format, ReadOnlySpan<byte> bin)
    {
        if (root.ValueKind != JsonValueKind.Object) return "not a glTF model";
        if (!root.TryGetProperty("asset", out var asset) || asset.ValueKind != JsonValueKind.Object
            || !asset.TryGetProperty("version", out var version) || version.ValueKind != JsonValueKind.String || !version.GetString()!.StartsWith("2."))
            return "only glTF 2.0 is supported";

        if (root.TryGetProperty("extensionsRequired", out var required))
        {
            if (required.ValueKind != JsonValueKind.Array) return "bad extensionsRequired";
            foreach (var ext in required.EnumerateArray())
                if (ext.ValueKind != JsonValueKind.String || !RequiredExtensions.Contains(ext.GetString()!))
                    return $"the model needs the extension {(ext.ValueKind == JsonValueKind.String ? ext.GetString() : "?")}, which is not supported (re-export it without compression)";
        }

        if (Arrays(root, "buffers", 16, out var buffers) is { } e1) return e1;
        if (Arrays(root, "bufferViews", 50_000, out var views) is { } e2) return e2;
        if (Arrays(root, "accessors", 50_000, out var accessors) is { } e3) return e3;
        if (Arrays(root, "meshes", 5_000, out var meshes) is { } e4) return e4;
        if (Arrays(root, "nodes", 10_000, out var nodes) is { } e5) return e5;
        if (Arrays(root, "images", 128, out var images) is { } e6) return e6;
        if (Arrays(root, "textures", 256, out var textures) is { } e7) return e7;
        if (Arrays(root, "materials", 2_000, out var materials) is { } e8) return e8;
        if (Arrays(root, "scenes", 100, out var scenes) is { } e9) return e9;

        var bufferLengths = new long[buffers.Count];
        for (var i = 0; i < buffers.Count; i++)
        {
            var b = buffers[i];
            if (!Whole(b, "byteLength", out var length) || length < 1) return "bad buffer";
            bufferLengths[i] = length;
            if (!b.TryGetProperty("uri", out var uri))
            {
                if (format != ModelFormat.Glb || i != 0 || bin.IsEmpty || length > bin.Length || bin.Length - length > 3) return "a buffer has no data";
                continue;
            }
            if (!DataUri(uri, BufferTypes, out var payload) || payload.Length / 4 * 3 < length - 2) return "external files are not allowed, embed the data in the model";
        }

        var viewEnd = new long[views.Count];
        var viewStart = new long[views.Count];
        var viewBuffer = new int[views.Count];
        for (var i = 0; i < views.Count; i++)
        {
            var v = views[i];
            if (!Index(v, "buffer", buffers.Count, true, out var buffer) || !Whole(v, "byteLength", out var length) || length < 1) return "bad buffer view";
            var offset = 0L;
            if (v.TryGetProperty("byteOffset", out _) && !Whole(v, "byteOffset", out offset)) return "bad buffer view";
            if (offset + length > bufferLengths[buffer]) return "a buffer view reaches outside its buffer";
            viewStart[i] = offset;
            viewEnd[i] = offset + length;
            viewBuffer[i] = buffer;
        }

        var counts = new long[accessors.Count];
        for (var i = 0; i < accessors.Count; i++)
        {
            var a = accessors[i];
            if (!Whole(a, "count", out var count) || count < 1 || count > 50_000_000) return "bad accessor";
            if (a.TryGetProperty("bufferView", out _) && !Index(a, "bufferView", views.Count, true, out _)) return "bad accessor";
            counts[i] = count;
        }

        long vertices = 0;
        foreach (var mesh in meshes)
        {
            if (!mesh.TryGetProperty("primitives", out var primitives) || primitives.ValueKind != JsonValueKind.Array || primitives.GetArrayLength() > 1_000) return "bad mesh";
            foreach (var p in primitives.EnumerateArray())
            {
                if (!p.TryGetProperty("attributes", out var attributes) || attributes.ValueKind != JsonValueKind.Object) return "bad mesh";
                foreach (var attribute in attributes.EnumerateObject())
                {
                    if (attribute.Value.ValueKind != JsonValueKind.Number || !attribute.Value.TryGetInt32(out var at) || at < 0 || at >= accessors.Count) return "bad mesh";
                    if (attribute.Name == "POSITION") vertices += counts[at];
                }
                if (p.TryGetProperty("indices", out _) && !Index(p, "indices", accessors.Count, true, out _)) return "bad mesh";
                if (p.TryGetProperty("material", out _) && !Index(p, "material", materials.Count, true, out _)) return "bad mesh";
            }
        }
        if (vertices > MaxVertices) return $"the model is too detailed ({vertices:N0} vertices, at most {MaxVertices:N0})";

        foreach (var n in nodes)
        {
            if (n.TryGetProperty("mesh", out _) && !Index(n, "mesh", meshes.Count, true, out _)) return "bad node";
            if (n.TryGetProperty("children", out var children) && (children.ValueKind != JsonValueKind.Array || children.EnumerateArray().Any(c => c.ValueKind != JsonValueKind.Number || !c.TryGetInt32(out var ci) || ci < 0 || ci >= nodes.Count)))
                return "bad node";
        }
        if (HasCycleOrSharedChild(nodes)) return "the node tree is not a tree";

        foreach (var s in scenes)
            if (s.TryGetProperty("nodes", out var roots) && (roots.ValueKind != JsonValueKind.Array || roots.EnumerateArray().Any(c => c.ValueKind != JsonValueKind.Number || !c.TryGetInt32(out var ci) || ci < 0 || ci >= nodes.Count)))
                return "bad scene";
        if (root.TryGetProperty("scene", out _) && !Index(root, "scene", scenes.Count, true, out _)) return "bad scene";

        foreach (var t in textures)
            if (t.TryGetProperty("source", out _) && !Index(t, "source", images.Count, true, out _)) return "bad texture";

        foreach (var image in images)
        {
            if (image.TryGetProperty("uri", out var uri))
            {
                if (!DataUri(uri, ImageTypes, out var payload, out var mime)) return "external files are not allowed, embed the image in the model";
                if (!ImageMagic(DecodeStart(payload), mime)) return "an image is not what it says it is";
                continue;
            }
            if (!image.TryGetProperty("mimeType", out var mt) || mt.ValueKind != JsonValueKind.String || !ImageTypes.Contains(mt.GetString()!)) return "unsupported image type";
            if (!Index(image, "bufferView", views.Count, true, out var view)) return "bad image";
            if (viewBuffer[view] == 0 && !bin.IsEmpty && !ImageMagic(bin.Slice((int)viewStart[view], (int)Math.Min(12, viewEnd[view] - viewStart[view])), mt.GetString()!)) return "an image is not what it says it is";
        }
        return null;
    }

    private static bool NextChunk(byte[] file, int offset, out uint type, out ReadOnlySpan<byte> data, out int next)
    {
        type = 0;
        data = default;
        next = 0;
        if (offset + 8 > file.Length) return false;
        var length = BinaryPrimitives.ReadUInt32LittleEndian(file.AsSpan(offset));
        type = BinaryPrimitives.ReadUInt32LittleEndian(file.AsSpan(offset + 4));
        if (length % 4 != 0 || offset + 8L + length > file.Length) return false;
        data = file.AsSpan(offset + 8, (int)length);
        next = offset + 8 + (int)length;
        return true;
    }

    private static string? Arrays(JsonElement root, string name, int max, out List<JsonElement> items)
    {
        items = [];
        if (!root.TryGetProperty(name, out var array)) return null;
        if (array.ValueKind != JsonValueKind.Array) return $"bad {name}";
        if (array.GetArrayLength() > max) return $"too many {name}";
        foreach (var item in array.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) return $"bad {name}";
            items.Add(item);
        }
        return null;
    }

    private static bool Whole(JsonElement obj, string name, out long value)
    {
        value = 0;
        return obj.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt64(out value) && value >= 0;
    }

    private static bool Index(JsonElement obj, string name, int count, bool required, out int value)
    {
        value = 0;
        if (!obj.TryGetProperty(name, out var v)) return !required;
        return v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out value) && value >= 0 && value < count;
    }

    private static bool DataUri(JsonElement uri, HashSet<string> types, out string payload) => DataUri(uri, types, out payload, out _);

    private static bool DataUri(JsonElement uri, HashSet<string> types, out string payload, out string mime)
    {
        payload = mime = "";
        if (uri.ValueKind != JsonValueKind.String) return false;
        var text = uri.GetString()!;
        const string prefix = "data:";
        const string marker = ";base64,";
        if (!text.StartsWith(prefix, StringComparison.Ordinal)) return false;
        var split = text.IndexOf(marker, StringComparison.Ordinal);
        if (split < 0) return false;
        mime = text[prefix.Length..split];
        if (!types.Contains(mime)) return false;
        payload = text[(split + marker.Length)..];
        return payload.Length > 0;
    }

    private static byte[] DecodeStart(string payload)
    {
        var head = payload[..Math.Min(payload.Length, 16)];
        head = head[..(head.Length / 4 * 4)];
        try { return Convert.FromBase64String(head); }
        catch (FormatException) { return []; }
    }

    private static bool ImageMagic(ReadOnlySpan<byte> head, string mime) => mime switch
    {
        "image/png" => head.StartsWith(new byte[] { 0x89, 0x50, 0x4E, 0x47 }),
        "image/jpeg" => head.StartsWith(new byte[] { 0xFF, 0xD8, 0xFF }),
        "image/webp" => head.Length >= 12 && head[..4].SequenceEqual("RIFF"u8) && head.Slice(8, 4).SequenceEqual("WEBP"u8),
        _ => false,
    };

    private static bool HasCycleOrSharedChild(List<JsonElement> nodes)
    {
        var state = new byte[nodes.Count];
        var parents = new int[nodes.Count];
        var kids = nodes.Select(n => n.TryGetProperty("children", out var c) ? c.EnumerateArray().Select(x => x.GetInt32()).ToArray() : []).ToArray();
        foreach (var list in kids)
            foreach (var child in list)
                if (++parents[child] > 1) return true;

        for (var start = 0; start < nodes.Count; start++)
        {
            if (state[start] != 0) continue;
            var stack = new Stack<(int Node, int Next)>();
            stack.Push((start, 0));
            state[start] = 1;
            while (stack.Count > 0)
            {
                var (node, next) = stack.Pop();
                if (next < kids[node].Length)
                {
                    stack.Push((node, next + 1));
                    var child = kids[node][next];
                    if (state[child] == 1) return true;
                    if (state[child] == 0)
                    {
                        state[child] = 1;
                        stack.Push((child, 0));
                    }
                }
                else
                {
                    state[node] = 2;
                }
            }
        }
        return false;
    }
}
