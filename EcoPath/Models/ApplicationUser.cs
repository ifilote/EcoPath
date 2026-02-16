using Microsoft.AspNetCore.Identity;

namespace EcoPath.Models
{
    public class ApplicationUser : IdentityUser
    {
        public double Weight { get; set; }
        public string City { get; set; } = string.Empty;
        public int TotalPoints { get; set; }
        public double Co2Saved { get; set; }

        public ICollection<Trip> Trips { get; set; } = new List<Trip>();
        public ICollection<Achievement> Achievements { get; set; } = new List<Achievement>();
        public ICollection<Route> Routes { get; set; } = new List<Route>();

        public UserStats? Stats { get; set; }
        public UserGoals? Goals { get; set; }
    }
}
