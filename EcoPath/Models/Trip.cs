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
    }
}
