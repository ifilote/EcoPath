using Microsoft.AspNetCore.Identity;
namespace EcoPath.Models
{
    public class UserStats
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public double TotalDistance { get; set; }
        public int TotalTrips { get; set; }
        public double TotalCo2Saved { get; set; }
        public double TotalCaloriesBurned { get; set; }

        public ApplicationUser? User { get; set; }

        public DateTime LastUpdated { get; set; }
    }
}