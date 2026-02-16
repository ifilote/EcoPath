using System.Collections.Generic;

namespace EcoPath.Models
{
    public class DashboardViewModel
    {
        // ── Overview Cards ──
        public double TotalCo2Saved { get; set; }
        public double TotalDistance { get; set; }
        public int TotalTrips { get; set; }
        public double TotalCaloriesBurned { get; set; }

        // ── Recent Activity ──
        public ICollection<Trip> RecentTrips { get; set; } = new List<Trip>();

        // ── Chart Data ──
        public Dictionary<string, int> WeeklyTrips { get; set; } = new();
        public Dictionary<string, double> WeeklyCo2Saved { get; set; } = new();
        public Dictionary<string, int> TransportBreakdown { get; set; } = new();
        public Dictionary<string, double> DailyActivity { get; set; } = new();

        // ── Leaderboard ──
        public ICollection<TopUserDto> TopUsers { get; set; } = new List<TopUserDto>();

        // ── City Comparison ──
        public double CityAverageCo2 { get; set; }
        public double CityAverageTrips { get; set; }
        public string UserCity { get; set; } = string.Empty;
        public double UserCo2 { get; set; }
        public int UserTripsCount { get; set; }

        // ── Achievements (dinamic) ──
        public List<AchievementProgressDto> AchievementProgress { get; set; } = new();
        public int AchievementCount { get; set; }
        public int TotalPossibleAchievements { get; set; }

        // ── Obiective configurabile per user ──
        public int WeeklyTripGoal { get; set; }
        public int WeeklyTripsCurrent { get; set; }
        public double WeeklyCo2Goal { get; set; }
        public double WeeklyCo2Current { get; set; }
        public double WeeklyDistanceGoal { get; set; }
        public double WeeklyDistanceCurrent { get; set; }
        public double WeeklyCaloriesGoal { get; set; }
        public double WeeklyCaloriesCurrent { get; set; }

        // ── User info ──
        public string UserName { get; set; } = string.Empty;
        public int UserRank { get; set; }
    }

    /// <summary>
    /// DTO pentru progres achievement: arata cat % din conditie e indeplinita.
    /// </summary>
    public class AchievementProgressDto
    {
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Icon { get; set; } = string.Empty;
        public bool IsUnlocked { get; set; }
        public DateTime? UnlockedAt { get; set; }
        public double CurrentValue { get; set; }
        public double TargetValue { get; set; }
        public double ProgressPercent => TargetValue > 0 ? Math.Min(100, (CurrentValue / TargetValue) * 100) : 0;
    }
}