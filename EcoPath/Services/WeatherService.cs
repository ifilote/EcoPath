using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace EcoPath.Services
{
    /// <summary>
    /// Production weather service using OpenWeatherMap free tier.
    /// 
    /// Architecture decisions:
    /// ─────────────────────
    /// • IHttpClientFactory: Proper socket management, avoids exhaustion.
    /// • IMemoryCache (15 min TTL): Weather doesn't change per-second — 
    ///   this prevents API abuse and stays within free-tier limits (60 calls/min).
    /// • Cache key by rounded coords (2 decimals ≈ 1.1km): Nearby users share cache.
    /// • Graceful degradation: Returns safe fallback on any failure.
    /// </summary>
    public class WeatherService : IWeatherService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IMemoryCache _cache;
        private readonly ILogger<WeatherService> _logger;
        private readonly string _apiKey;

        private const int CacheMinutes = 15;
        private const string BaseUrl = "https://api.openweathermap.org/data/2.5/weather";

        public WeatherService(
            IHttpClientFactory httpClientFactory,
            IMemoryCache cache,
            ILogger<WeatherService> logger,
            IConfiguration configuration)
        {
            _httpClientFactory = httpClientFactory;
            _cache = cache;
            _logger = logger;
            _apiKey = configuration["Weather:ApiKey"] ?? "";
        }

        public async Task<WeatherResult> GetCurrentWeatherAsync(double latitude, double longitude)
        {
            // Round to 2 decimals (~1.1km precision) for cache efficiency
            var cacheKey = $"weather_{latitude:F2}_{longitude:F2}";

            if (_cache.TryGetValue(cacheKey, out WeatherResult? cached) && cached != null)
            {
                _logger.LogDebug("Weather cache hit for {Key}", cacheKey);
                return cached;
            }

            try
            {
                var client = _httpClientFactory.CreateClient("WeatherApi");
                var url = $"{BaseUrl}?lat={latitude:F4}&lon={longitude:F4}&appid={_apiKey}&units=metric&lang=ro";

                var response = await client.GetAsync(url);
                response.EnsureSuccessStatusCode();

                var json = await response.Content.ReadAsStringAsync();
                var data = JsonDocument.Parse(json);
                var root = data.RootElement;

                var weather = root.GetProperty("weather")[0];
                var main = root.GetProperty("main");
                var wind = root.GetProperty("wind");
                var sys = root.GetProperty("sys");

                var result = new WeatherResult
                {
                    Temperature = main.GetProperty("temp").GetDouble(),
                    FeelsLike = main.GetProperty("feels_like").GetDouble(),
                    Humidity = main.GetProperty("humidity").GetInt32(),
                    WindSpeed = wind.GetProperty("speed").GetDouble(),
                    Description = weather.GetProperty("description").GetString() ?? "",
                    WeatherType = NormalizeWeatherType(weather.GetProperty("main").GetString() ?? "Clear"),
                    Icon = weather.GetProperty("icon").GetString() ?? "01d",
                    City = root.GetProperty("name").GetString() ?? "",
                    Country = sys.GetProperty("country").GetString() ?? "",
                    TimezoneOffset = root.GetProperty("timezone").GetInt32(),
                    Sunrise = sys.GetProperty("sunrise").GetInt64(),
                    Sunset = sys.GetProperty("sunset").GetInt64()
                };

                _cache.Set(cacheKey, result, TimeSpan.FromMinutes(CacheMinutes));
                _logger.LogInformation("Weather fetched for {City}, {Country}: {Temp}°C, {Type}",
                    result.City, result.Country, result.Temperature, result.WeatherType);

                return result;
            }
            catch (HttpRequestException httpEx)
            {
                _logger.LogWarning("Weather API HTTP error for ({Lat}, {Lon}): {Status} — {Message}",
                    latitude, longitude, httpEx.StatusCode, httpEx.Message);
                return GetFallbackWeather();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Weather API call failed for ({Lat}, {Lon}). Returning fallback.", latitude, longitude);
                return GetFallbackWeather();
            }
        }

        /// <summary>
        /// Normalize OpenWeatherMap "main" field to our internal taxonomy.
        /// This keeps frontend logic clean — only 7 weather types to handle.
        /// </summary>
        private static string NormalizeWeatherType(string owmMain) => owmMain.ToLowerInvariant() switch
        {
            "clear" => "clear",
            "clouds" => "clouds",
            "rain" => "rain",
            "drizzle" => "drizzle",
            "thunderstorm" => "thunderstorm",
            "snow" => "snow",
            "mist" or "fog" or "haze" or "smoke" or "dust" or "sand" or "ash" or "squall" or "tornado" => "mist",
            _ => "clear"
        };

        private static WeatherResult GetFallbackWeather() => new()
        {
            Success = false,
            Temperature = 0,
            FeelsLike = 0,
            Humidity = 0,
            WindSpeed = 0,
            Description = "date indisponibile",
            WeatherType = "clear",
            Icon = "01d",
            City = "Detectare locație...",
            Country = "",
            TimezoneOffset = 7200, // UTC+2 Romania default
            Sunrise = 0,
            Sunset = 0
        };
    }
}
