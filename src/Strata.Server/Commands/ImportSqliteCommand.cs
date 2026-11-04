using System.Text.Json;
using Microsoft.Data.Sqlite;
using Strata.Server.Api;
using Strata.Server.Storage;

namespace Strata.Server.Commands;

public static class ImportSqliteCommand
{
    public static async Task<int> RunAsync(IServiceProvider services, string[] args)
    {
        var file = args.FirstOrDefault(a => !a.StartsWith("--"));
        if (file is null || !File.Exists(file))
        {
            Console.Error.WriteLine("Usage: import-sqlite <path to the old strata.db> [--overwrite]");
            return 2;
        }

        List<ExportedDiagram> diagrams;
        try { diagrams = ReadLegacyFile(file); }
        catch (SqliteException e)
        {
            Console.Error.WriteLine($"Could not read {file}: {e.Message}");
            return 1;
        }

        await using var scope = services.CreateAsyncScope();
        var transfer = scope.ServiceProvider.GetRequiredService<DiagramTransfer>();
        var result = await transfer.ImportAsync(diagrams, args.Contains("--overwrite"), CancellationToken.None);

        Console.WriteLine($"Imported {result.Imported}, replaced {result.Replaced}, skipped {result.Skipped} (already present), rejected {result.Rejected.Count}.");
        foreach (var r in result.Rejected) Console.WriteLine($"  rejected {r.Id} \"{r.Name}\": {r.Error}");
        return result.Rejected.Count == 0 ? 0 : 1;
    }

    private static List<ExportedDiagram> ReadLegacyFile(string file)
    {
        using var connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = file, Mode = SqliteOpenMode.ReadOnly }.ToString());
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT id, view_token, name, data, created_at, updated_at FROM diagrams ORDER BY created_at";

        var rows = new List<ExportedDiagram>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var data = TryParse(reader.GetString(3));
            rows.Add(new ExportedDiagram(reader.GetString(0), reader.GetString(1), reader.GetString(2), data, reader.GetInt64(4), reader.GetInt64(5)));
        }
        return rows;
    }

    private static JsonElement TryParse(string json)
    {
        try { return JsonSerializer.Deserialize<JsonElement>(json); }
        catch (JsonException) { return default; }
    }
}
