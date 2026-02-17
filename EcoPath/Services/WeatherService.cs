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

                var rawCityName = root.GetProperty("name").GetString() ?? "";
                var country = sys.GetProperty("country").GetString() ?? "";
                
                var result = new WeatherResult
                {
                    Temperature = main.GetProperty("temp").GetDouble(),
                    FeelsLike = main.GetProperty("feels_like").GetDouble(),
                    Humidity = main.GetProperty("humidity").GetInt32(),
                    WindSpeed = wind.GetProperty("speed").GetDouble(),
                    Description = weather.GetProperty("description").GetString() ?? "",
                    WeatherType = NormalizeWeatherType(weather.GetProperty("main").GetString() ?? "Clear"),
                    Icon = weather.GetProperty("icon").GetString() ?? "01d",
                    City = BeautifyCityName(rawCityName, latitude, longitude, country),
                    Country = country,
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

        /// <summary>
        /// Beautify city names by mapping obscure locations to nearby major cities.
        /// OpenWeatherMap's database sometimes returns small villages instead of
        /// the main city. This improves UX by showing familiar city names.
        /// </summary>
        private static string BeautifyCityName(string rawName, double lat, double lon, string country)
        {
            // Romania major cities mapping based on coordinate zones
            if (country == "RO")
            {
                // Galați metropolitan area (45.40-45.50 lat, 27.95-28.10 lon)
                if (lat >= 45.40 && lat <= 45.50 && lon >= 27.95 && lon <= 28.10)
                    return "Galați";
                
                // București metropolitan area (44.35-44.50 lat, 25.95-26.25 lon)
                if (lat >= 44.35 && lat <= 44.50 && lon >= 25.95 && lon <= 26.25)
                    return "București";
                
                // Cluj-Napoca metropolitan area (46.70-46.82 lat, 23.50-23.70 lon)
                if (lat >= 46.70 && lat <= 46.82 && lon >= 23.50 && lon <= 23.70)
                    return "Cluj-Napoca";
                
                // Iași metropolitan area (47.10-47.20 lat, 27.50-27.65 lon)
                if (lat >= 47.10 && lat <= 47.20 && lon >= 27.50 && lon <= 27.65)
                    return "Iași";
                
                // Timișoara metropolitan area (45.70-45.80 lat, 21.15-21.30 lon)
                if (lat >= 45.70 && lat <= 45.80 && lon >= 21.15 && lon <= 21.30)
                    return "Timișoara";
                
                // Constanța metropolitan area (44.10-44.25 lat, 28.55-28.70 lon)
                if (lat >= 44.10 && lat <= 44.25 && lon >= 28.55 && lon <= 28.70)
                    return "Constanța";
                
                // Craiova metropolitan area (44.28-44.35 lat, 23.75-23.85 lon)
                if (lat >= 44.28 && lat <= 44.35 && lon >= 23.75 && lon <= 23.85)
                    return "Craiova";
                
                // Brașov metropolitan area (45.60-45.70 lat, 25.55-25.65 lon)
                if (lat >= 45.60 && lat <= 45.70 && lon >= 25.55 && lon <= 25.65)
                    return "Brașov";
            }

            // Return original name if no mapping found
            return rawName;
        }

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
