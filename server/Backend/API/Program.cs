using System.Text.Json;
using API.CustomError;
using API.Extensions;
using Domain.Models;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.EntityFrameworkCore;
using Services;
using Services.Data;

namespace API;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        // PORT / STRATA_DB / STRATA_DIST keep working as environment variables, like the Node server.
        var config = builder.Configuration;
        var dbFile = config["STRATA_DB"] ?? "./data/strata.db";
        var dist = config["STRATA_DIST"] ?? Path.Combine(Directory.GetCurrentDirectory(), "dist");
        if (config["PORT"] is { } port)
        {
            builder.WebHost.UseUrls($"http://*:{port}");
        }

        if (dbFile != ":memory:")
        {
            var dir = Path.GetDirectoryName(Path.GetFullPath(dbFile));
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        }

        builder.Services.AddControllers(options =>
            {
                // The models keep unknown fields as JsonElement; they are data, not something to validate.
                options.ModelMetadataDetailsProviders.Add(new SuppressChildValidationMetadataProvider(typeof(JsonElement)));
            })
            .AddJsonOptions(options => DiagramJson.Configure(options.JsonSerializerOptions))
            .ConfigureApiBehaviorOptions(options => options.InvalidModelStateResponseFactory = ValidationErrorResponse.Create);

        builder.Services.AddOpenApi();
        builder.Services.AddDbContext<StrataDbContext>(o => o.UseSqlite($"Data Source={dbFile}"));
        builder.Services.AddScoped<IDiagramService, DiagramService>();

        var app = builder.Build();

        // Creates the schema if missing (CREATE TABLE IF NOT EXISTS semantics, like the Node server).
        using (var scope = app.Services.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<StrataDbContext>().Database.EnsureCreated();
        }

        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
        }

        app.MapGet("/healthz", () => Results.Text("ok"));
        app.MapControllers();
        app.MapStrataWebApp(dist);

        app.Run();
    }
}
