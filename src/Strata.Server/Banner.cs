namespace Strata.Server;

public static class Banner
{
    public static string Box(params string[] lines)
    {
        var color = Environment.GetEnvironmentVariable("NO_COLOR") is null;
        string Paint(string code, string s) => color ? $"\u001b[{code}m{s}\u001b[0m" : s;

        var inner = lines.Max(l => l.Length) + 2;
        var rows = lines.Select((l, i) =>
            Paint("36", "│") + " " + (i == 0 ? Paint("1", l) : l) + new string(' ', inner - l.Length - 1) + Paint("36", "│"));
        return string.Join('\n', ["", Paint("36", "┌" + new string('─', inner) + "┐"), .. rows, Paint("36", "└" + new string('─', inner) + "┘"), ""]);
    }
}
