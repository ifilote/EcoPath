using Microsoft.AspNetCore.Identity;

namespace EcoPath.Models
{
    public class ApplicationUser : IdentityUser
    {
        public double Weight { get; set; }
        public string City { get; set; } = string.Empty;
        public int TotalPoints { get; set; }
        public double Co2Saved { get; set; }
    }
}
