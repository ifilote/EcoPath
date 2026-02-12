using EcoPath.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace EcoPath.Data
{
    public class ApplicationDbContext : IdentityDbContext<ApplicationUser>
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<Trip> Trips { get; set; }
        public DbSet<UserStats> UserStats { get; set; }
        public DbSet<Achievement> Achievements { get; set; }
        public DbSet<Models.Route> Routes { get; set; }
    }
}
