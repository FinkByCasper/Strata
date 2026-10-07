using System.Text.Json.Serialization;

namespace Domain.Models;

// Serialized in camelCase by DiagramJson (Accesspoint -> "accesspoint"); only the hyphenated value needs an explicit name.

public enum Shape
{
    Box, Cylinder, Sphere, Slab,
    User, Server, Router, Accesspoint, Pc, Laptop, Phone, Database, Cache, Switch, Firewall, Antenna, Printer, Cloud, Container, Pyramid,
}

public enum Route
{
    Orthogonal,
    [JsonStringEnumMemberName("orthogonal-z")] OrthogonalZ,
    Straight,
    Curved,
}

public enum Flow { None, Forward, Both }

public enum LabelMode { Edge, Center, None }

public enum LabelEdge { Back, Front, Left, Right }
