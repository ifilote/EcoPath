namespace EcoPath.Services
{
    /// <summary>
    /// Abstraction for weather data retrieval.
    /// Enables testability and future provider swaps (OpenWeatherMap → WeatherAPI, etc.).
    /// </summary>
    public interface IWeatherService
    {
        Task<WeatherResult> GetCurrentWeatherAsync(double latitude, double longitude);
    }

    /// <summary>
    /// Immutable weather result DTO. 
    /// Maps raw API response to a clean domain model consumed by frontend.
    /// </summary>
    public class WeatherResult
    {
        public bool Success { get; init; } = true;
        public double Temperature { get; init; }
        public double FeelsLike { get; init; }
        public int Humidity { get; init; }
        public double WindSpeed { get; init; }
        public string Description { get; init; } = string.Empty;
        public string WeatherType { get; init; } = "clear";   // clear, clouds, rain, snow, thunderstorm, drizzle, mist
        public string Icon { get; init; } = "01d";
        public string City { get; init; } = string.Empty;
        public string Country { get; init; } = string.Empty;
        public int TimezoneOffset { get; init; }               // UTC offset in seconds — allows accurate local time
        public long Sunrise { get; init; }
        public long Sunset { get; init; }
    }
}
