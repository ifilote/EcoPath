using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using EcoPath.Models;
using EcoPath.Services;

namespace EcoPath.Pages.Trip
{
    public class RecommendModel : PageModel
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly IRecommendationService _recommendationService;
        private readonly ILogger<RecommendModel> _logger;

        [BindProperty]
        public float Distance { get; set; }

        [BindProperty]
        public int Hour { get; set; } = DateTime.Now.Hour;

        [BindProperty]
        public int DayOfWeek { get; set; } = (int)DateTime.Now.DayOfWeek;

        [BindProperty]
        public float TimeSensitivity { get; set; } = 5.0f;

        public TripPrediction? Recommendation { get; set; }

        public RecommendModel(
            UserManager<ApplicationUser> userManager,
            IRecommendationService recommendationService,
            ILogger<RecommendModel> logger)
        {
            _userManager = userManager;
            _recommendationService = recommendationService;
            _logger = logger;
        }

        public async Task<IActionResult> OnPostAsync()
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null)
                return Unauthorized();

            try
            {
                // Build trip data for ML model
                var tripData = new TripData
                {
                    HourOfDay = Hour,
                    DayOfWeek = DayOfWeek,
                    DistanceKm = Distance,
                    UserTimeSensitivity = TimeSensitivity,
                    UserWalkingPreference = 2.5f // TODO: Fetch from user profile
                };

                // Get recommendation
                Recommendation = await _recommendationService.PredictModeAsync(user.Id, tripData);

                _logger.LogInformation(
                    "✓ Recommendation generated for {UserId}: {Mode} (confidence: {Confidence}%)",
                    user.Id,
                    Recommendation.PredictedLabel,
                    Recommendation.ConfidenceByMode.TryGetValue(Recommendation.PredictedLabel, out var conf)
                        ? (conf * 100).ToString("F1")
                        : "N/A");

                return Page();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating recommendation for user {UserId}", user.Id);
                ModelState.AddModelError("", "Failed to generate recommendation. Please try again.");
                return Page();
            }
        }
    }
}