using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using EcoPath.Services;

namespace EcoPath.Controllers
{
    /// <summary>
    /// Weather API endpoint — protected by [Authorize].
    /// 
    /// Architectural reasoning:
    /// ────────────────────────
    /// 1. [Authorize] ensures only authenticated users can fetch weather data.
    ///    This prevents anonymous abuse of our OpenWeatherMap quota.
    /// 2. The browser sends lat/lon from Geolocation API → Controller validates 
    ///    → WeatherService fetches (with cache) → returns clean JSON.
    /// 3. QuoteService is called server-side to keep quote logic encapsulated 
    ///    and prevent client-side manipulation.
    /// 4. Single endpoint returns both weather + quote = one round-trip for UI.
    /// </summary>
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class WeatherController : ControllerBase
    {
        private readonly IWeatherService _weatherService;
        private readonly IQuoteService _quoteService;
        private readonly ILogger<WeatherController> _logger;

        public WeatherController(
            IWeatherService weatherService,
            IQuoteService quoteService,
            ILogger<WeatherController> logger)
        {
            _weatherService = weatherService;
            _quoteService = quoteService;
            _logger = logger;
        }

        /// <summary>
        /// GET /api/weather?lat=44.43&lon=26.10&ecoScore=250
        /// Returns weather data + eco-motivational quote in a single response.
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> Get(
            [FromQuery] double lat,
            [FromQuery] double lon,
            [FromQuery] double ecoScore = 0)
        {
            // Validate coordinates
            if (lat < -90 || lat > 90 || lon < -180 || lon > 180)
            {
                return BadRequest(new { error = "Invalid coordinates." });
            }

            try
            {
                var weather = await _weatherService.GetCurrentWeatherAsync(lat, lon);
                var quote = _quoteService.GetQuote(weather.WeatherType, ecoScore);

                return Ok(new WeatherResponse
                {
                    Success = weather.Success,
                    Temperature = Math.Round(weather.Temperature, 1),
                    FeelsLike = Math.Round(weather.FeelsLike, 1),
                    Humidity = weather.Humidity,
                    WindSpeed = Math.Round(weather.WindSpeed, 1),
                    Description = weather.Description,
                    WeatherType = weather.WeatherType,
                    Icon = weather.Icon,
                    City = weather.City,
                    Country = weather.Country,
                    TimezoneOffset = weather.TimezoneOffset,
                    Sunrise = weather.Sunrise,
                    Sunset = weather.Sunset,
                    Quote = quote.Text,
                    QuoteAuthor = quote.Author
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Weather endpoint failed for ({Lat}, {Lon})", lat, lon);
                return StatusCode(500, new { error = "Weather service temporarily unavailable." });
            }
        }
    }

    /// <summary>
    /// Flat response DTO — combines weather + quote for minimal round-trips.
    /// </summary>
    public class WeatherResponse
    {
        public bool Success { get; init; }
        public double Temperature { get; init; }
        public double FeelsLike { get; init; }
        public int Humidity { get; init; }
        public double WindSpeed { get; init; }
        public string Description { get; init; } = "";
        public string WeatherType { get; init; } = "";
        public string Icon { get; init; } = "";
        public string City { get; init; } = "";
        public string Country { get; init; } = "";
        public int TimezoneOffset { get; init; }
        public long Sunrise { get; init; }
        public long Sunset { get; init; }
        public string Quote { get; init; } = "";
        public string QuoteAuthor { get; init; } = "";
    }
}
