using System.Text.Json;
using API.CustomError;
using Domain.Models;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Services;

namespace API.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddStrataApi(this IServiceCollection services, string dbFile)
    {
        services.AddControllers(options =>
            {
                // The models keep unknown fields as JsonElement; they are data, not something to validate.
                options.ModelMetadataDetailsProviders.Add(new SuppressChildValidationMetadataProvider(typeof(JsonElement)));
            })
            .AddJsonOptions(options => DiagramJson.Configure(options.JsonSerializerOptions))
            .ConfigureApiBehaviorOptions(options => options.InvalidModelStateResponseFactory = ValidationErrorResponse.Create);

        services.AddOpenApi();
        services.AddStrataServices(dbFile);
        return services;
    }
}
