using System.Buffers.Binary;
using System.Text;
using System.Text.Json.Nodes;
using Strata.Data;
using Strata.Server.Models;

namespace Strata.Server.Tests;

public class GltfValidatorTests
{
    private static string? Check(byte[] file) => GltfValidator.Check(file, out _);

    [Fact]
    public void A_binary_model_is_accepted()
    {
        Assert.Null(GltfValidator.Check(Glb.Make(), out var format));
        Assert.Equal(ModelFormat.Glb, format);
    }

    [Fact]
    public void A_json_model_with_embedded_data_is_accepted()
    {
        Assert.Null(GltfValidator.Check(Glb.Embedded(), out var format));
        Assert.Equal(ModelFormat.Gltf, format);
    }

    [Fact]
    public void Things_that_are_not_models_are_refused()
    {
        Assert.NotNull(Check([]));
        Assert.NotNull(Check(Encoding.UTF8.GetBytes("<svg onload=alert(1)/>")));
        Assert.NotNull(Check(Encoding.UTF8.GetBytes("""{"hello":"world"}""")));
        Assert.NotNull(Check(Encoding.UTF8.GetBytes("[1,2,3]")));
        Assert.NotNull(Check(new byte[4096]));
    }

    [Fact]
    public void A_truncated_or_padded_binary_is_refused()
    {
        var file = Glb.Make();
        Assert.NotNull(Check(file[..^4]));
        Assert.NotNull(Check([.. file, 0, 0, 0, 0]));
    }

    [Fact]
    public void Only_version_two_is_accepted()
    {
        Assert.Contains("2.0", Check(Glb.Make(j => j["asset"]!["version"] = "1.0"))!);
        var file = Glb.Make();
        BinaryPrimitives.WriteUInt32LittleEndian(file.AsSpan(4), 1);
        Assert.NotNull(Check(file));
    }

    [Fact]
    public void Chunks_other_than_json_and_binary_are_refused()
    {
        var file = Glb.Make();
        BinaryPrimitives.WriteUInt32LittleEndian(file.AsSpan(16), 0x12345678);
        Assert.NotNull(Check(file));
    }

    [Theory]
    [InlineData("file.bin")]
    [InlineData("../../etc/passwd")]
    [InlineData("https://example.com/x.bin")]
    [InlineData("data:text/html;base64,PHNjcmlwdD4=")]
    public void Buffers_may_not_point_anywhere_else(string uri)
    {
        var error = Check(Glb.Make(j => j["buffers"]![0]!["uri"] = uri));
        Assert.Contains("embed", error);
    }

    [Theory]
    [InlineData("https://example.com/a.png")]
    [InlineData("texture.png")]
    [InlineData("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")]
    public void Images_may_not_point_anywhere_else(string uri)
    {
        var error = Check(Glb.Make(j =>
        {
            j["images"] = new JsonArray(new JsonObject { ["uri"] = uri });
            j["textures"] = new JsonArray(new JsonObject { ["source"] = 0 });
        }));
        Assert.Contains("embed", error);
    }

    [Fact]
    public void An_embedded_image_must_really_be_one()
    {
        var png = "data:image/png;base64," + Convert.ToBase64String([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);
        Assert.Null(Check(Glb.Make(j => j["images"] = new JsonArray(new JsonObject { ["uri"] = png }))));

        var fake = "data:image/png;base64," + Convert.ToBase64String(Encoding.ASCII.GetBytes("<script>alert(1)</script>"));
        Assert.Contains("not what it says", Check(Glb.Make(j => j["images"] = new JsonArray(new JsonObject { ["uri"] = fake }))));
    }

    [Fact]
    public void An_image_inside_the_binary_must_really_be_one()
    {
        var bin = new byte[48];
        Encoding.ASCII.GetBytes("<svg xmlns=").CopyTo(bin, 36);
        var error = Check(Glb.Make(j =>
        {
            j["buffers"]![0]!["byteLength"] = 48;
            j["bufferViews"]!.AsArray().Add(new JsonObject { ["buffer"] = 0, ["byteOffset"] = 36, ["byteLength"] = 12 });
            j["images"] = new JsonArray(new JsonObject { ["bufferView"] = 1, ["mimeType"] = "image/png" });
        }, bin));
        Assert.Contains("not what it says", error);
    }

    [Fact]
    public void Compressed_models_that_need_a_decoder_are_refused_with_advice()
    {
        var error = Check(Glb.Make(j => j["extensionsRequired"] = new JsonArray("KHR_draco_mesh_compression")));
        Assert.Contains("KHR_draco_mesh_compression", error);
        Assert.Contains("without compression", error);
        Assert.Null(Check(Glb.Make(j => j["extensionsRequired"] = new JsonArray("KHR_materials_unlit"))));
        Assert.Null(Check(Glb.Make(j => j["extensionsUsed"] = new JsonArray("KHR_draco_mesh_compression"))));
    }

    [Fact]
    public void Everything_that_points_at_something_must_point_at_something_that_exists()
    {
        Assert.NotNull(Check(Glb.Make(j => j["nodes"]![0]!["mesh"] = 4)));
        Assert.NotNull(Check(Glb.Make(j => j["meshes"]![0]!["primitives"]![0]!["attributes"]!["POSITION"] = 9)));
        Assert.NotNull(Check(Glb.Make(j => j["accessors"]![0]!["bufferView"] = 3)));
        Assert.NotNull(Check(Glb.Make(j => j["bufferViews"]![0]!["buffer"] = 2)));
        Assert.NotNull(Check(Glb.Make(j => j["scenes"]![0]!["nodes"] = new JsonArray(7))));
        Assert.NotNull(Check(Glb.Make(j => j["scene"] = 3)));
        Assert.NotNull(Check(Glb.Make(j => j["nodes"]![0]!["children"] = new JsonArray(5))));
    }

    [Fact]
    public void A_buffer_view_cannot_reach_outside_its_buffer()
    {
        Assert.NotNull(Check(Glb.Make(j => j["bufferViews"]![0]!["byteLength"] = 4096)));
        Assert.NotNull(Check(Glb.Make(j => j["bufferViews"]![0]!["byteOffset"] = 30)));
        Assert.NotNull(Check(Glb.Make(j => j["bufferViews"]![0]!["byteLength"] = -1)));
    }

    [Fact]
    public void The_binary_chunk_must_back_the_declared_buffer()
    {
        Assert.NotNull(Check(Glb.Make(j => j["buffers"]![0]!["byteLength"] = 1000)));
        Assert.NotNull(Check(Glb.Make(withBin: false)));
    }

    [Fact]
    public void A_node_tree_with_loops_is_refused()
    {
        var loop = Check(Glb.Make(j => j["nodes"] = new JsonArray(new JsonObject { ["children"] = new JsonArray(1), ["mesh"] = 0 }, new JsonObject { ["children"] = new JsonArray(0) })));
        Assert.Contains("tree", loop);
        var shared = Check(Glb.Make(j => j["nodes"] = new JsonArray(new JsonObject { ["children"] = new JsonArray(2) }, new JsonObject { ["children"] = new JsonArray(2) }, new JsonObject { ["mesh"] = 0 })));
        Assert.Contains("tree", shared);
        var selfLoop = Check(Glb.Make(j => j["nodes"]![0]!["children"] = new JsonArray(0)));
        Assert.Contains("tree", selfLoop);
        Assert.Null(Check(Glb.Make(j => j["nodes"] = new JsonArray(new JsonObject { ["children"] = new JsonArray(1, 2) }, new JsonObject { ["mesh"] = 0 }, new JsonObject { ["mesh"] = 0 }))));
    }

    [Fact]
    public void Absurdly_detailed_models_are_refused()
    {
        var error = Check(Glb.Make(j => j["accessors"]![0]!["count"] = GltfValidator.MaxVertices + 1));
        Assert.Contains("too detailed", error);
        Assert.Null(Check(Glb.Make(j => j["accessors"]![0]!["count"] = 3)));
    }

    [Fact]
    public void Too_many_things_of_one_kind_are_refused()
    {
        var error = Check(Glb.Make(j => j["nodes"] = new JsonArray(Enumerable.Range(0, 10_001).Select(_ => (JsonNode)new JsonObject()).ToArray())));
        Assert.Contains("too many nodes", error);
    }

    [Fact]
    public void Deeply_nested_json_is_refused_rather_than_crashing()
    {
        var deep = "{\"asset\":{\"version\":\"2.0\"},\"extras\":" + new string('[', 200) + new string(']', 200) + "}";
        Assert.NotNull(Check(Glb.Pack(deep, null)));
    }
}
