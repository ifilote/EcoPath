using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using EcoPath.Models;
using EcoPath.Data;
using System.Text;

namespace EcoPath.Controllers
{
    [Authorize]
    public class TripController : Controller
    {
        private readonly ApplicationDbContext _context;
        private readonly UserManager<ApplicationUser> _userManager;
        public TripController(ApplicationDbContext context, UserManager<ApplicationUser> userManager)
        {
            _context = context;
            _userManager = userManager;
        }

        // ═══════════════════════════════════════════════════════
        //  VIEW ACTIONS
        // ═══════════════════════════════════════════════════════

        public async Task<IActionResult> History()
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null)
            {
                return NotFound();
            }

            var trips = await _context.Trips
                .Where(t => t.UserId == user.Id)
                .OrderByDescending(t => t.StartTime)
                .ToListAsync();

            return View(trips);
        }

        public async Task<IActionResult> Details(int id)
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null)
            {
                return NotFound();
            }

            var trip = await _context.Trips
                .FirstOrDefaultAsync(t => t.Id == id && t.UserId == user.Id);

            if (trip == null)
            {
                return NotFound();
            }

            return View(trip);
        }

        // ═══════════════════════════════════════════════════════
        //  API ENDPOINTS — Live trip tracking (Phase 3)
        // ═══════════════════════════════════════════════════════

        /// <summary>
        /// POST /Trip/ApiStart
        /// Creates a new trip record in Active status. Returns the trip ID.
        /// </summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ApiStart([FromBody] TripStartDto dto)
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null)
                return Unauthorized(new { error = "User not authenticated" });

            var trip = new Trip
            {
                UserId = user.Id,
                Status = TripStatus.Active,
                TransportType = MapGoogleModeToTransportType(dto.TransportMode),
                StartLocation = dto.StartLocation ?? "",
                EndLocation = dto.EndLocation ?? "",
                StartLatitude = dto.StartLatitude,
                StartLongitude = dto.StartLongitude,
                EndLatitude = dto.EndLatitude,
                EndLongitude = dto.EndLongitude,
                TotalRouteDistance = dto.TotalRouteDistance,
                RouteSummary = dto.RouteSummary ?? "",
                StartTime = DateTime.UtcNow,
                Distance = 0,
                DistanceCovered = 0,
                Duration = 0,
                AverageSpeed = 0,
                CaloriesBurned = 0,
                Co2Saved = 0,
                IsVerified = false
            };

            _context.Trips.Add(trip);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                tripId = trip.Id,
                status = trip.Status.ToString(),
                startTime = trip.StartTime
            });
        }

        /// <summary>
        /// POST /Trip/ApiUpdate
        /// Periodic update during navigation — syncs distance, duration, speed.
        /// </summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ApiUpdate([FromBody] TripUpdateDto dto)
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null)
                return Unauthorized(new { error = "User not authenticated" });

            var trip = await _context.Trips
                .FirstOrDefaultAsync(t => t.Id == dto.TripId && t.UserId == user.Id);

            if (trip == null)
                return NotFound(new { error = "Trip not found" });

            if (trip.Status != TripStatus.Active && trip.Status != TripStatus.Paused)
                return BadRequest(new { error = "Trip is not active" });

            trip.DistanceCovered = dto.DistanceCovered;
            trip.Duration = dto.Duration;
            trip.AverageSpeed = dto.AverageSpeed;
            trip.Status = dto.IsPaused ? TripStatus.Paused : TripStatus.Active;

            await _context.SaveChangesAsync();

            return Ok(new
            {
                tripId = trip.Id,
                status = trip.Status.ToString(),
                distanceCovered = trip.DistanceCovered,
                duration = trip.Duration
            });
        }

        /// <summary>
        /// POST /Trip/ApiFinish
        /// Marks the trip as completed, calculates CO2 saved and calories.
        /// </summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ApiFinish([FromBody] TripFinishDto dto)
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null)
                return Unauthorized(new { error = "User not authenticated" });

            var trip = await _context.Trips
                .FirstOrDefaultAsync(t => t.Id == dto.TripId && t.UserId == user.Id);

            if (trip == null)
                return NotFound(new { error = "Trip not found" });

            trip.Status = TripStatus.Finished;
            trip.DistanceCovered = dto.DistanceCovered;
            trip.Distance = dto.DistanceCovered / 1000.0; // Convert m → km
            trip.Duration = dto.Duration;
            trip.AverageSpeed = dto.AverageSpeed;
            trip.EndTime = DateTime.UtcNow;
            trip.IsVerified = true;

            // Calculate CO2 saved (compared to driving)
            var distKm = trip.Distance;
            trip.Co2Saved = CalculateCo2Saved(trip.TransportType, distKm);
            trip.CaloriesBurned = CalculateCalories(trip.TransportType, distKm);

            await _context.SaveChangesAsync();

            // Update user stats
            await UpdateUserStats(user.Id);

            return Ok(new
            {
                tripId = trip.Id,
                status = trip.Status.ToString(),
                distance = trip.Distance,
                duration = trip.Duration,
                co2Saved = trip.Co2Saved,
                caloriesBurned = trip.CaloriesBurned,
                averageSpeed = trip.AverageSpeed,
                completionPercent = trip.TotalRouteDistance > 0
                    ? Math.Round(trip.DistanceCovered / trip.TotalRouteDistance * 100, 1)
                    : 100
            });
        }

        /// <summary>
        /// POST /Trip/ApiCancel
        /// Marks a trip as canceled (user-initiated stop). Records partial progress.
        /// </summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ApiCancel([FromBody] TripFinishDto dto)
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null)
                return Unauthorized(new { error = "User not authenticated" });

            var trip = await _context.Trips
                .FirstOrDefaultAsync(t => t.Id == dto.TripId && t.UserId == user.Id);

            if (trip == null)
                return NotFound(new { error = "Trip not found" });

            trip.Status = TripStatus.Canceled;
            trip.DistanceCovered = dto.DistanceCovered;
            trip.Distance = dto.DistanceCovered / 1000.0;
            trip.Duration = dto.Duration;
            trip.AverageSpeed = dto.AverageSpeed;
            trip.EndTime = DateTime.UtcNow;
            trip.IsVerified = false;

            // Partial CO2 savings
            var distKm = trip.Distance;
            trip.Co2Saved = CalculateCo2Saved(trip.TransportType, distKm);
            trip.CaloriesBurned = CalculateCalories(trip.TransportType, distKm);

            await _context.SaveChangesAsync();

            // Update user stats even for partial trips
            await UpdateUserStats(user.Id);

            var completionPercent = trip.TotalRouteDistance > 0
                ? Math.Round(trip.DistanceCovered / trip.TotalRouteDistance * 100, 1)
                : 0;

            return Ok(new
            {
                tripId = trip.Id,
                status = trip.Status.ToString(),
                distance = trip.Distance,
                duration = trip.Duration,
                co2Saved = trip.Co2Saved,
                caloriesBurned = trip.CaloriesBurned,
                averageSpeed = trip.AverageSpeed,
                completionPercent
            });
        }

        // ═══════════════════════════════════════════════════════
        //  PRIVATE HELPERS
        // ═══════════════════════════════════════════════════════

        private static TransportType MapGoogleModeToTransportType(string googleMode)
        {
            return googleMode?.ToUpperInvariant() switch
            {
                "DRIVING" => TransportType.Car,
                "WALKING" => TransportType.Walking,
                "BICYCLING" => TransportType.Biking,
                "TRANSIT" => TransportType.Bus,
                _ => TransportType.Car
            };
        }

        private static double CalculateCo2Saved(TransportType type, double distKm)
        {
            // CO2 saved compared to driving (0.12 kg/km for cars)
            const double carEmission = 0.12;
            double modeEmission = type switch
            {
                TransportType.Walking => 0,
                TransportType.Biking => 0,
                TransportType.Bus => 0.06,
                TransportType.Tram => 0.04,
                TransportType.Metro => 0.03,
                TransportType.Car => 0,    // no savings if driving
                _ => 0
            };
            return Math.Max(0, (carEmission - modeEmission) * distKm);
        }

        private static double CalculateCalories(TransportType type, double distKm)
        {
            // Rough calorie estimates per km
            return type switch
            {
                TransportType.Walking => distKm * 60,
                TransportType.Biking => distKm * 30,
                _ => 0
            };
        }

        private async Task UpdateUserStats(string userId)
        {
            var stats = await _context.UserStats
                .FirstOrDefaultAsync(s => s.UserId == userId);

            if (stats == null)
            {
                stats = new UserStats { UserId = userId };
                _context.UserStats.Add(stats);
            }

            var allTrips = await _context.Trips
                .Where(t => t.UserId == userId &&
                       (t.Status == TripStatus.Finished || t.Status == TripStatus.Canceled))
                .ToListAsync();

            stats.TotalTrips = allTrips.Count;
            stats.TotalDistance = allTrips.Sum(t => t.Distance);
            stats.TotalCo2Saved = allTrips.Sum(t => t.Co2Saved);
            stats.TotalCaloriesBurned = allTrips.Sum(t => t.CaloriesBurned);
            stats.LastUpdated = DateTime.UtcNow;

            await _context.SaveChangesAsync();
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  DTOs — Request payloads for API endpoints
    // ═══════════════════════════════════════════════════════════

    public class TripStartDto
    {
        public string TransportMode { get; set; } = "DRIVING";
        public string? StartLocation { get; set; }
        public string? EndLocation { get; set; }
        public double StartLatitude { get; set; }
        public double StartLongitude { get; set; }
        public double EndLatitude { get; set; }
        public double EndLongitude { get; set; }
        public double TotalRouteDistance { get; set; }
        public string? RouteSummary { get; set; }
    }

    public class TripUpdateDto
    {
        public int TripId { get; set; }
        public double DistanceCovered { get; set; }
        public int Duration { get; set; }
        public double AverageSpeed { get; set; }
        public bool IsPaused { get; set; }
    }

    public class TripFinishDto
    {
        public int TripId { get; set; }
        public double DistanceCovered { get; set; }
        public int Duration { get; set; }
        public double AverageSpeed { get; set; }
    }
}