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
    public class DashboardController : Controller
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly ApplicationDbContext _context;
        public DashboardController(UserManager<ApplicationUser> userManager, ApplicationDbContext context)
        {
            _userManager = userManager;
            _context = context;
        }

        public async Task<IActionResult> Index()
        {
            // ═══════ 1. GET CURRENT USER ═══════
            var user = await _userManager.GetUserAsync(User);
            if (user == null) return NotFound();

            // ═══════ 2. USER STATS ═══════
            var stats = await _context.UserStats.FirstOrDefaultAsync(s => s.UserId == user.Id);

            // ═══════ 3. RECENT 5 TRIPS ═══════
            var recentTrips = await _context.Trips
                .Where(t => t.UserId == user.Id)
                .OrderByDescending(t => t.StartTime)
                .Take(5)
                .ToListAsync();

            // ═══════ 4. WEEKLY DATA (ultimele 7 zile) ═══════
            var sevenDaysAgo = DateTime.Now.AddDays(-7);
            var weekTrips = await _context.Trips
                .Where(t => t.UserId == user.Id && t.StartTime >= sevenDaysAgo)
                .ToListAsync();

            // Grupeaza pe zi: "Monday" => 3 trips
            var weeklyTripsData = weekTrips
                .GroupBy(t => t.StartTime.DayOfWeek.ToString())
                .ToDictionary(g => g.Key, g => g.Count());

            var weeklyCo2Data = weekTrips
                .GroupBy(t => t.StartTime.DayOfWeek.ToString())
                .ToDictionary(g => g.Key, g => g.Sum(t => t.Co2Saved));

            // ═══════ 5. TRANSPORT BREAKDOWN (toate trip-urile) ═══════
            var allUserTrips = await _context.Trips
                .Where(t => t.UserId == user.Id)
                .ToListAsync();

            var transportData = allUserTrips
                .GroupBy(t => t.TransportType.ToString())
                .ToDictionary(g => g.Key, g => g.Count());

            // ═══════ 6. DAILY ACTIVITY - HEATMAP (ultimul an) ═══════
            var oneYearAgo = DateTime.Now.AddYears(-1);
            var dailyActivityData = allUserTrips
                .Where(t => t.StartTime >= oneYearAgo)
                .GroupBy(t => t.StartTime.Date.ToString("yyyy-MM-dd"))
                .ToDictionary(g => g.Key, g => g.Sum(t => t.Distance));

            // ═══════ 7. LEADERBOARD TOP 5 ═══════
            var topUsers = await _context.Users
                .OrderByDescending(u => u.Co2Saved)
                .Take(5)
                .Select(u => new TopUserDto
                {
                    UserName = u.UserName ?? "Anonim",
                    City = u.City,
                    Co2Saved = u.Co2Saved,
                    TotalTrips = u.Trips.Count
                })
                .ToListAsync();

            // Calculeaza rankul userului curent
            var userRank = await _context.Users.CountAsync(u => u.Co2Saved > user.Co2Saved) + 1;

            // ═══════ 8. CITY COMPARISON ═══════
            double cityAvgCo2 = 0;
            double cityAvgTrips = 0;
            if (!string.IsNullOrEmpty(user.City))
            {
                var cityStats = await _context.Users
                    .Where(u => u.City == user.City)
                    .Select(u => new { u.Co2Saved, TripCount = u.Trips.Count })
                    .ToListAsync();

                if (cityStats.Count > 1)
                {
                    cityAvgCo2 = cityStats.Average(c => c.Co2Saved);
                    cityAvgTrips = cityStats.Average(c => c.TripCount);
                }
            }

            // ═══════ 9. ACHIEVEMENTS DINAMICE ═══════
            // Incarcam TOATE definitiile de achievements + cele deblocate de user
            var allDefinitions = await _context.AchievementDefinitions.ToListAsync();
            var unlockedAchievements = await _context.Achievements
                .Where(a => a.UserId == user.Id)
                .ToListAsync();

            var unlockedNames = unlockedAchievements
                .Select(a => a.Name)
                .ToHashSet();

            // Calculeaza progresul pentru fiecare achievement
            var achievementProgress = allDefinitions.Select(def =>
            {
                double currentValue = def.ConditionType switch
                {
                    "trips" => stats?.TotalTrips ?? 0,
                    "distance" => stats?.TotalDistance ?? 0,
                    "co2" => stats?.TotalCo2Saved ?? 0,
                    "calories" => stats?.TotalCaloriesBurned ?? 0,
                    _ => 0
                };

                var unlocked = unlockedAchievements.FirstOrDefault(a => a.Name == def.Name);

                return new AchievementProgressDto
                {
                    Name = def.Name,
                    Description = def.Description,
                    Icon = def.Icon,
                    IsUnlocked = unlockedNames.Contains(def.Name),
                    UnlockedAt = unlocked?.UnlockedAt,
                    CurrentValue = currentValue,
                    TargetValue = def.ConditionValue
                };
            }).ToList();

            // ═══════ 10. OBIECTIVE CONFIGURABILE PER USER ═══════
            var goals = await _context.UserGoals.FirstOrDefaultAsync(g => g.UserId == user.Id);
            if (goals == null)
            {
                // Creeaza goals default daca nu exista
                goals = new UserGoals
                {
                    UserId = user.Id,
                    WeeklyTripGoal = 7,
                    WeeklyCo2Goal = 50.0,
                    WeeklyDistanceGoal = 30.0,
                    WeeklyCaloriesGoal = 2000
                };
                _context.UserGoals.Add(goals);
                await _context.SaveChangesAsync();
            }

            var weeklyCalories = weekTrips.Sum(t => t.CaloriesBurned);
            var weeklyDistance = weekTrips.Sum(t => t.Distance);

            // ═══════ 11. CONSTRUIESTE VIEWMODEL ═══════
            var viewModel = new DashboardViewModel
            {
                // Overview
                TotalCo2Saved = stats?.TotalCo2Saved ?? 0,
                TotalDistance = stats?.TotalDistance ?? 0,
                TotalTrips = stats?.TotalTrips ?? 0,
                TotalCaloriesBurned = stats?.TotalCaloriesBurned ?? 0,

                // Recent activity
                RecentTrips = recentTrips,

                // Chart data
                WeeklyTrips = weeklyTripsData,
                WeeklyCo2Saved = weeklyCo2Data,
                TransportBreakdown = transportData,
                DailyActivity = dailyActivityData,

                // Leaderboard
                TopUsers = topUsers,

                // City comparison
                CityAverageCo2 = Math.Round(cityAvgCo2, 2),
                CityAverageTrips = Math.Round(cityAvgTrips, 1),
                UserCity = user.City,
                UserCo2 = user.Co2Saved,
                UserTripsCount = allUserTrips.Count,

                // Achievements dinamice
                AchievementProgress = achievementProgress,
                AchievementCount = unlockedAchievements.Count,
                TotalPossibleAchievements = allDefinitions.Count,

                // Obiective configurabile
                WeeklyTripGoal = goals.WeeklyTripGoal,
                WeeklyTripsCurrent = weekTrips.Count,
                WeeklyCo2Goal = goals.WeeklyCo2Goal,
                WeeklyCo2Current = weekTrips.Sum(t => t.Co2Saved),
                WeeklyDistanceGoal = goals.WeeklyDistanceGoal,
                WeeklyDistanceCurrent = weeklyDistance,
                WeeklyCaloriesGoal = goals.WeeklyCaloriesGoal,
                WeeklyCaloriesCurrent = weeklyCalories,

                // User info
                UserName = user.UserName ?? "Eco Warrior",
                UserRank = userRank
            };

            return View(viewModel);
        }

        // ═══════ UPDATE GOALS (AJAX) ═══════
        /// <summary>
        /// Permite userului sa-si modifice obiectivele din dashboard.
        /// Se apeleaza prin AJAX din frontend.
        /// </summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> UpdateGoals(int weeklyTripGoal, double weeklyCo2Goal, double weeklyDistanceGoal, double weeklyCaloriesGoal)
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null) return NotFound();

            var goals = await _context.UserGoals.FirstOrDefaultAsync(g => g.UserId == user.Id);
            if (goals == null) return NotFound();

            goals.WeeklyTripGoal = weeklyTripGoal;
            goals.WeeklyCo2Goal = weeklyCo2Goal;
            goals.WeeklyDistanceGoal = weeklyDistanceGoal;
            goals.WeeklyCaloriesGoal = weeklyCaloriesGoal;

            await _context.SaveChangesAsync();
            return Json(new { success = true });
        }

        // ═══════ EXPORT CSV ═══════
        /// <summary>
        /// Exporta toate calatoriile userului in format CSV.
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> ExportCsv()
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null) return NotFound();

            var trips = await _context.Trips
                .Where(t => t.UserId == user.Id)
                .OrderByDescending(t => t.StartTime)
                .ToListAsync();

            var csv = new StringBuilder();
            csv.AppendLine("Data,De la,Pana la,Distanta (km),Durata (min),Transport,CO2 Salvat (kg),Calorii");

            foreach (var trip in trips)
            {
                csv.AppendLine($"{trip.StartTime:yyyy-MM-dd},{trip.StartLocation},{trip.EndLocation},{trip.Distance:F2},{trip.Duration},{trip.TransportType},{trip.Co2Saved:F2},{trip.CaloriesBurned:F0}");
            }

            var bytes = Encoding.UTF8.GetBytes(csv.ToString());
            return File(bytes, "text/csv", $"EcoPath-Stats-{DateTime.Now:yyyy-MM-dd}.csv");
        }
    }
}
