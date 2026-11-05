namespace Strata.Data;

public enum ModelFormat
{
    Glb,
    Gltf,
}

public class ModelAsset
{
    public required string DiagramId { get; set; }
    public required string Id { get; set; }
    public required string Name { get; set; }
    public ModelFormat Format { get; set; }
    public required string Sha256 { get; set; }
    public long Size { get; set; }
    public required byte[] Data { get; set; }
    public long CreatedAt { get; set; }
}
