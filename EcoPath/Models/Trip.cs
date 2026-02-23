using Microsoft.AspNetCore.Identity;
namespace EcoPath.Models
{
    public class Trip
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public ApplicationUser? User { get; set; }
        public string StartLocation { get; set; } = string.Empty;
        public string EndLocation { get; set; } = string.Empty;
        public double Distance { get; set; }
        public int Duration { get; set; }
        public TransportType TransportType { get; set; }
        public double CaloriesBurned { get; set; }
        public double Co2Saved { get; set; }
        public DateTime StartTime { get; set; }
        public DateTime EndTime { get; set; }
        public bool IsVerified { get; set; }

        // ── Live-tracking fields (Phase 3) ──
        public TripStatus Status { get; set; } = TripStatus.Active;
        public double StartLatitude { get; set; }
        public double StartLongitude { get; set; }
        public double EndLatitude { get; set; }
        public double EndLongitude { get; set; }
        public double DistanceCovered { get; set; }
        public double TotalRouteDistance { get; set; }
        public double AverageSpeed { get; set; }
        public string RouteSummary { get; set; } = string.Empty;
    }
}
