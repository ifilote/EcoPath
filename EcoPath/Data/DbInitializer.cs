using EcoPath.Data;
using EcoPath.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace EcoPath.Data
{
    public static class DbInitializer
    {
        /// <summary>
        /// Inițializează baza de date cu roluri și date demo
        /// Această metodă se apelează automat la pornirea aplicației
        /// </summary>
        public static async Task Initialize(IServiceProvider serviceProvider)
        {
            // Obținem serviciile necesare din Dependency Injection
            var context = serviceProvider.GetRequiredService<ApplicationDbContext>();
            var userManager = serviceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var roleManager = serviceProvider.GetRequiredService<RoleManager<IdentityRole>>();
            var logger = serviceProvider.GetRequiredService<ILogger<Program>>();

            try
            {
                // Asigurăm că baza de date există și toate migrațiile sunt aplicate
                await context.Database.MigrateAsync();
                logger.LogInformation("Baza de date a fost verificată/creată cu succes.");

                // ==================== SEED ROLURI ====================
                await SeedRoles(roleManager, logger);

                // ==================== SEED UTILIZATOR ADMIN (Opțional) ====================
                await SeedAdminUser(userManager, logger);

                // ==================== SEED DEMO USERS ====================
                await SeedDemoUsers(userManager, context, logger);

                logger.LogInformation("Inițializarea bazei de date s-a finalizat cu succes!");
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "A apărut o eroare în timpul inițializării bazei de date.");
                throw;
            }
        }

        /// <summary>
        /// Creează rolurile "Admin" și "User" dacă nu există
        /// </summary>
        private static async Task SeedRoles(RoleManager<IdentityRole> roleManager, ILogger logger)
        {
            string[] roleNames = { "Admin", "User" };

            foreach (var roleName in roleNames)
            {
                // Verificăm dacă rolul există deja
                var roleExist = await roleManager.RoleExistsAsync(roleName);
                if (!roleExist)
                {
                    // Creăm rolul nou
                    var result = await roleManager.CreateAsync(new IdentityRole(roleName));
                    if (result.Succeeded)
                    {
                        logger.LogInformation($"Rolul '{roleName}' a fost creat cu succes.");
                    }
                    else
                    {
                        logger.LogWarning($"Eroare la crearea rolului '{roleName}': {string.Join(", ", result.Errors.Select(e => e.Description))}");
                    }
                }
                else
                {
                    logger.LogInformation($"Rolul '{roleName}' există deja.");
                }
            }
        }

        /// <summary>
        /// Creează un utilizator Admin demo dacă nu există
        /// ATENȚIE: În producție, șterge această metodă sau folosește parole puternice!
        /// </summary>
        private static async Task SeedAdminUser(UserManager<ApplicationUser> userManager, ILogger logger)
        {
            const string adminEmail = "admin@ecopath.ro";
            const string adminPassword = "Admin123!"; // ⚠️ SCHIMBĂ CÂND TRECI ÎN PRODUCȚIE!

            // Verificăm dacă adminul există deja
            var adminUser = await userManager.FindByEmailAsync(adminEmail);

            if (adminUser == null)
            {
                // Creăm utilizatorul admin
                adminUser = new ApplicationUser
                {
                    UserName = "admin",
                    Email = adminEmail,
                    EmailConfirmed = true, // Confirmăm automat email-ul pentru admin
                    Weight = 75.0,
                    City = "București",
                    TotalPoints = 0,
                    Co2Saved = 0
                };

                var result = await userManager.CreateAsync(adminUser, adminPassword);

                if (result.Succeeded)
                {
                    logger.LogInformation($"Utilizatorul admin '{adminEmail}' a fost creat.");

                    // Adăugăm utilizatorul la rolul "Admin"
                    await userManager.AddToRoleAsync(adminUser, "Admin");
                    logger.LogInformation($"Utilizatorul admin a fost adăugat la rolul 'Admin'.");
                }
                else
                {
                    logger.LogWarning($"Eroare la crearea adminului: {string.Join(", ", result.Errors.Select(e => e.Description))}");
                }
            }
            else
            {
                logger.LogInformation($"Utilizatorul admin '{adminEmail}' există deja.");
            }
        }

        /// <summary>
        /// Creează utilizatori demo cu călătorii, statistici și realizări
        /// </summary>
        private static async Task SeedDemoUsers(UserManager<ApplicationUser> userManager, ApplicationDbContext context, ILogger logger)
        {
            // Verificăm dacă există deja useri demo
            if (context.Users.Any(u => u.UserName == "maria.ionescu"))
            {
                logger.LogInformation("Utilizatorii demo există deja.");
                return;
            }

            logger.LogInformation("Se creează utilizatori demo...");

            // ===== UTILIZATOR 1: Maria Ionescu - Utilizator activ =====
            var maria = new ApplicationUser
            {
                UserName = "maria.ionescu",
                Email = "maria.ionescu@ecopath.ro",
                EmailConfirmed = true,
                Weight = 65.0,
                City = "București",
                TotalPoints = 850,
                Co2Saved = 45.8
            };
            await CreateUserWithData(userManager, context, maria, "Demo123!", logger);

            // ===== UTILIZATOR 2: Andrei Popescu - Power User =====
            var andrei = new ApplicationUser
            {
                UserName = "andrei.popescu",
                Email = "andrei.popescu@ecopath.ro",
                EmailConfirmed = true,
                Weight = 80.0,
                City = "Cluj-Napoca",
                TotalPoints = 1520,
                Co2Saved = 89.4
            };
            await CreateUserWithData(userManager, context, andrei, "Demo123!", logger);

            // ===== UTILIZATOR 3: Elena Vasilescu - Utilizator nou =====
            var elena = new ApplicationUser
            {
                UserName = "elena.vasilescu",
                Email = "elena.vasilescu@ecopath.ro",
                EmailConfirmed = true,
                Weight = 58.0,
                City = "Timișoara",
                TotalPoints = 120,
                Co2Saved = 8.5
            };
            await CreateUserWithData(userManager, context, elena, "Demo123!", logger);

            await context.SaveChangesAsync();
            logger.LogInformation("Utilizatori demo creați cu succes!");
        }

        /// <summary>
        /// Creează un utilizator cu călătorii, stats și achievements
        /// </summary>
        private static async Task CreateUserWithData(UserManager<ApplicationUser> userManager, ApplicationDbContext context, ApplicationUser user, string password, ILogger logger)
        {
            var result = await userManager.CreateAsync(user, password);
            if (!result.Succeeded)
            {
                logger.LogWarning($"Eroare la crearea utilizatorului {user.UserName}: {string.Join(", ", result.Errors.Select(e => e.Description))}");
                return;
            }

            await userManager.AddToRoleAsync(user, "User");

            // Obținem user-ul creat pentru a avea ID-ul
            var createdUser = await userManager.FindByNameAsync(user.UserName!);
            if (createdUser == null) return;

            // Cream stats pentru user
            var stats = new UserStats
            {
                UserId = createdUser.Id,
                TotalDistance = 0,
                TotalTrips = 0,
                TotalCo2Saved = 0,
                TotalCaloriesBurned = 0,
                LastUpdated = DateTime.Now
            };
            context.UserStats.Add(stats);
            await context.SaveChangesAsync();

            // Adăugăm călătorii și achievements în funcție de utilizator
            if (user.UserName == "maria.ionescu")
            {
                await CreateTripsForMaria(context, createdUser.Id, stats);
                await CreateAchievementsForMaria(context, createdUser.Id);
            }
            else if (user.UserName == "andrei.popescu")
            {
                await CreateTripsForAndrei(context, createdUser.Id, stats);
                await CreateAchievementsForAndrei(context, createdUser.Id);
            }
            else if (user.UserName == "elena.vasilescu")
            {
                await CreateTripsForElena(context, createdUser.Id, stats);
            }

            await context.SaveChangesAsync();
            logger.LogInformation($"Date create pentru {user.UserName}");
        }

        private static async Task CreateTripsForMaria(ApplicationDbContext context, string userId, UserStats stats)
        {
            var trips = new List<Trip>
            {
                new Trip
                {
                    UserId = userId,
                    StartLocation = "Piața Unirii",
                    EndLocation = "Piața Victoriei",
                    Distance = 4.2,
                    Duration = 25,
                    TransportType = TransportType.Biking,
                    CaloriesBurned = 120,
                    Co2Saved = 0.95,
                    StartTime = DateTime.Now.AddDays(-15),
                    EndTime = DateTime.Now.AddDays(-15).AddMinutes(25),
                    IsVerified = true
                },
                new Trip
                {
                    UserId = userId,
                    StartLocation = "Universitate",
                    EndLocation = "Obor",
                    Distance = 3.8,
                    Duration = 20,
                    TransportType = TransportType.Walking,
                    CaloriesBurned = 180,
                    Co2Saved = 0.86,
                    StartTime = DateTime.Now.AddDays(-10),
                    EndTime = DateTime.Now.AddDays(-10).AddMinutes(20),
                    IsVerified = true
                },
                new Trip
                {
                    UserId = userId,
                    StartLocation = "Gara de Nord",
                    EndLocation = "Politehnica",
                    Distance = 6.5,
                    Duration = 35,
                    TransportType = TransportType.Bus,
                    CaloriesBurned = 0,
                    Co2Saved = 1.47,
                    StartTime = DateTime.Now.AddDays(-5),
                    EndTime = DateTime.Now.AddDays(-5).AddMinutes(35),
                    IsVerified = true
                },
                new Trip
                {
                    UserId = userId,
                    StartLocation = "Parcul Herăstrău",
                    EndLocation = "Arcul de Triumf",
                    Distance = 2.1,
                    Duration = 45,
                    TransportType = TransportType.Walking,
                    CaloriesBurned = 140,
                    Co2Saved = 0.48,
                    StartTime = DateTime.Now.AddDays(-2),
                    EndTime = DateTime.Now.AddDays(-2).AddMinutes(45),
                    IsVerified = true
                }
            };

            context.Trips.AddRange(trips);
            
            // Actualizăm stats
            stats.TotalTrips = trips.Count;
            stats.TotalDistance = trips.Sum(t => t.Distance);
            stats.TotalCo2Saved = trips.Sum(t => t.Co2Saved);
            stats.TotalCaloriesBurned = trips.Sum(t => t.CaloriesBurned);
            stats.LastUpdated = DateTime.Now;
        }

        private static async Task CreateTripsForAndrei(ApplicationDbContext context, string userId, UserStats stats)
        {
            var trips = new List<Trip>
            {
                new Trip
                {
                    UserId = userId,
                    StartLocation = "Piața Unirii Cluj",
                    EndLocation = "Iulius Mall",
                    Distance = 8.5,
                    Duration = 40,
                    TransportType = TransportType.Biking,
                    CaloriesBurned = 280,
                    Co2Saved = 1.92,
                    StartTime = DateTime.Now.AddDays(-20),
                    EndTime = DateTime.Now.AddDays(-20).AddMinutes(40),
                    IsVerified = true
                },
                new Trip
                {
                    UserId = userId,
                    StartLocation = "Universitatea Babeș-Bolyai",
                    EndLocation = "Parcul Central",
                    Distance = 5.2,
                    Duration = 35,
                    TransportType = TransportType.Walking,
                    CaloriesBurned = 320,
                    Co2Saved = 1.18,
                    StartTime = DateTime.Now.AddDays(-18),
                    EndTime = DateTime.Now.AddDays(-18).AddMinutes(35),
                    IsVerified = true
                },
                new Trip
                {
                    UserId = userId,
                    StartLocation = "Piața Mărăști",
                    EndLocation = "Baza Sportivă",
                    Distance = 12.3,
                    Duration = 55,
                    TransportType = TransportType.Biking,
                    CaloriesBurned = 420,
                    Co2Saved = 2.78,
                    StartTime = DateTime.Now.AddDays(-12),
                    EndTime = DateTime.Now.AddDays(-12).AddMinutes(55),
                    IsVerified = true
                },
                new Trip
                {
                    UserId = userId,
                    StartLocation = "Gheorgheni",
                    EndLocation = "Centru",
                    Distance = 7.8,
                    Duration = 45,
                    TransportType = TransportType.Tram,
                    CaloriesBurned = 0,
                    Co2Saved = 1.76,
                    StartTime = DateTime.Now.AddDays(-8),
                    EndTime = DateTime.Now.AddDays(-8).AddMinutes(45),
                    IsVerified = true
                },
                new Trip
                {
                    UserId = userId,
                    StartLocation = "Zorilor",
                    EndLocation = "Mănăștur",
                    Distance = 9.5,
                    Duration = 50,
                    TransportType = TransportType.Biking,
                    CaloriesBurned = 380,
                    Co2Saved = 2.15,
                    StartTime = DateTime.Now.AddDays(-3),
                    EndTime = DateTime.Now.AddDays(-3).AddMinutes(50),
                    IsVerified = true
                },
                new Trip
                {
                    UserId = userId,
                    StartLocation = "FSEGA",
                    EndLocation = "Observator",
                    Distance = 4.1,
                    Duration = 25,
                    TransportType = TransportType.Walking,
                    CaloriesBurned = 210,
                    Co2Saved = 0.93,
                    StartTime = DateTime.Now.AddDays(-1),
                    EndTime = DateTime.Now.AddDays(-1).AddMinutes(25),
                    IsVerified = true
                }
            };

            context.Trips.AddRange(trips);
            
            stats.TotalTrips = trips.Count;
            stats.TotalDistance = trips.Sum(t => t.Distance);
            stats.TotalCo2Saved = trips.Sum(t => t.Co2Saved);
            stats.TotalCaloriesBurned = trips.Sum(t => t.CaloriesBurned);
            stats.LastUpdated = DateTime.Now;
        }

        private static async Task CreateTripsForElena(ApplicationDbContext context, string userId, UserStats stats)
        {
            var trips = new List<Trip>
            {
                new Trip
                {
                    UserId = userId,
                    StartLocation = "Piața Victoriei Timișoara",
                    EndLocation = "Iulius Town",
                    Distance = 3.2,
                    Duration = 20,
                    TransportType = TransportType.Walking,
                    CaloriesBurned = 160,
                    Co2Saved = 0.72,
                    StartTime = DateTime.Now.AddDays(-3),
                    EndTime = DateTime.Now.AddDays(-3).AddMinutes(20),
                    IsVerified = true
                },
                new Trip
                {
                    UserId = userId,
                    StartLocation = "Universitatea Politehnica",
                    EndLocation = "Parcul Rozelor",
                    Distance = 2.5,
                    Duration = 15,
                    TransportType = TransportType.Biking,
                    CaloriesBurned = 95,
                    Co2Saved = 0.57,
                    StartTime = DateTime.Now.AddDays(-1),
                    EndTime = DateTime.Now.AddDays(-1).AddMinutes(15),
                    IsVerified = false
                }
            };

            context.Trips.AddRange(trips);
            
            stats.TotalTrips = trips.Count;
            stats.TotalDistance = trips.Sum(t => t.Distance);
            stats.TotalCo2Saved = trips.Sum(t => t.Co2Saved);
            stats.TotalCaloriesBurned = trips.Sum(t => t.CaloriesBurned);
            stats.LastUpdated = DateTime.Now;
        }

        private static async Task CreateAchievementsForMaria(ApplicationDbContext context, string userId)
        {
            var achievements = new List<Achievement>
            {
                new Achievement
                {
                    UserId = userId,
                    Name = "Prima Călătorie",
                    Description = "Ai completat prima ta călătorie eco-friendly!",
                    Icon = "bi bi-star-fill",
                    UnlockedAt = DateTime.Now.AddDays(-15)
                },
                new Achievement
                {
                    UserId = userId,
                    Name = "Eco Warrior",
                    Description = "Ai salvat 10 kg de CO₂",
                    Icon = "bi bi-shield-fill-check",
                    UnlockedAt = DateTime.Now.AddDays(-7)
                }
            };
            context.Achievements.AddRange(achievements);
        }

        private static async Task CreateAchievementsForAndrei(ApplicationDbContext context, string userId)
        {
            var achievements = new List<Achievement>
            {
                new Achievement
                {
                    UserId = userId,
                    Name = "Prima Călătorie",
                    Description = "Ai completat prima ta călătorie eco-friendly!",
                    Icon = "bi bi-star-fill",
                    UnlockedAt = DateTime.Now.AddDays(-20)
                },
                new Achievement
                {
                    UserId = userId,
                    Name = "Eco Warrior",
                    Description = "Ai salvat 10 kg de CO₂",
                    Icon = "bi bi-shield-fill-check",
                    UnlockedAt = DateTime.Now.AddDays(-15)
                },
                new Achievement
                {
                    UserId = userId,
                    Name = "Biciclist Pro",
                    Description = "Ai parcurs 50 km cu bicicleta",
                    Icon = "bi bi-bicycle",
                    UnlockedAt = DateTime.Now.AddDays(-10)
                },
                new Achievement
                {
                    UserId = userId,
                    Name = "Eco Champion",
                    Description = "Ai salvat 50 kg de CO₂",
                    Icon = "bi bi-trophy-fill",
                    UnlockedAt = DateTime.Now.AddDays(-5)
                }
            };
            context.Achievements.AddRange(achievements);
        }
    }
}
