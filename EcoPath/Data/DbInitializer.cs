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

                // ==================== SEED ACHIEVEMENT DEFINITIONS ====================
                await SeedAchievementDefinitions(context, logger);

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

            logger.LogInformation("Se creează utilizatori demo cu date bogate...");

            var demoUsers = new[]
            {
                new { UserName = "maria.ionescu", Email = "maria.ionescu@ecopath.ro", Weight = 65.0, City = "București", TripsCount = 35 },
                new { UserName = "andrei.popescu", Email = "andrei.popescu@ecopath.ro", Weight = 80.0, City = "București", TripsCount = 42 },
                new { UserName = "elena.vasilescu", Email = "elena.vasilescu@ecopath.ro", Weight = 58.0, City = "Cluj-Napoca", TripsCount = 28 },
                new { UserName = "george.stan", Email = "george.stan@ecopath.ro", Weight = 75.0, City = "Timișoara", TripsCount = 38 },
                new { UserName = "alexandra.marin", Email = "alexandra.marin@ecopath.ro", Weight = 62.0, City = "București", TripsCount = 45 },
                new { UserName = "vlad.ionescu", Email = "vlad.ionescu@ecopath.ro", Weight = 85.0, City = "Cluj-Napoca", TripsCount = 31 },
                new { UserName = "diana.popa", Email = "diana.popa@ecopath.ro", Weight = 60.0, City = "Iași", TripsCount = 22 },
                new { UserName = "mihai.dumitrescu", Email = "mihai.dumitrescu@ecopath.ro", Weight = 78.0, City = "Brașov", TripsCount = 18 }
            };

            foreach (var userData in demoUsers)
            {
                var user = new ApplicationUser
                {
                    UserName = userData.UserName,
                    Email = userData.Email,
                    EmailConfirmed = true,
                    Weight = userData.Weight,
                    City = userData.City,
                    TotalPoints = 0,
                    Co2Saved = 0
                };

                var result = await userManager.CreateAsync(user, "Demo123!");
                if (!result.Succeeded)
                {
                    logger.LogWarning($"Eroare la crearea utilizatorului {user.UserName}");
                    continue;
                }

                await userManager.AddToRoleAsync(user, "User");

                var createdUser = await userManager.FindByNameAsync(user.UserName!);
                if (createdUser == null) continue;

                // Stats
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

                // UserGoals
                var goals = new UserGoals
                {
                    UserId = createdUser.Id,
                    WeeklyTripGoal = new Random().Next(5, 12),
                    WeeklyCo2Goal = new Random().Next(30, 80),
                    WeeklyDistanceGoal = new Random().Next(20, 60),
                    WeeklyCaloriesGoal = new Random().Next(1500, 3000)
                };
                context.UserGoals.Add(goals);

                await context.SaveChangesAsync();

                // Generate trips
                await GenerateTripsForUser(context, createdUser.Id, userData.City, userData.TripsCount, stats);

                // Update user's Co2Saved
                createdUser.Co2Saved = stats.TotalCo2Saved;
                createdUser.TotalPoints = (int)(stats.TotalCo2Saved * 10 + stats.TotalDistance * 2);
                await userManager.UpdateAsync(createdUser);

                await context.SaveChangesAsync();
                logger.LogInformation($"✓ {userData.UserName}: {userData.TripsCount} trips, {stats.TotalCo2Saved:F1} kg CO₂");
            }

            logger.LogInformation($"✓ {demoUsers.Length} utilizatori demo creați cu succes!");
        }

        /// <summary>
        /// Generează trips realiste pentru un user pe ultimele 60 zile
        /// </summary>
        private static async Task GenerateTripsForUser(ApplicationDbContext context, string userId, string city, int tripCount, UserStats stats)
        {
            var rand = new Random(userId.GetHashCode()); // seed consistent per user
            var trips = new List<Trip>();

            // Locații per oraș
            var locations = city switch
            {
                "București" => new[] { "Piața Unirii", "Piața Victoriei", "Universitate", "Obor", "Gara de Nord", "Politehnica", "Parcul Herăstrău", "Arcul de Triumf", "Berceni", "Titan" },
                "Cluj-Napoca" => new[] { "Piața Unirii", "Iulius Mall", "UBB", "Parcul Central", "Piața Mărăști", "Baza Sportivă", "Gheorgheni", "Centru", "Zorilor", "Mănăștur" },
                "Timișoara" => new[] { "Piața Victoriei", "Iulius Town", "Politehnica", "Parcul Rozelor", "Piața Operei", "Stadion", "Circumvalațiunii", "Sagului" },
                "Iași" => new[] { "Piața Unirii", "Palas", "Universitate", "Copou", "Tătărași", "Gara", "Podu Roș", "Alexandru cel Bun" },
                "Brașov" => new[] { "Piața Sfatului", "Coresi", "Tractorul", "Noua", "Astra", "Gării", "Rulmentul", "Bartolomeu" },
                _ => new[] { "Centru", "Nord", "Sud", "Est", "Vest", "Gară", "Parc", "Mall" }
            };

            var transportTypes = Enum.GetValues<TransportType>();

            for (int i = 0; i < tripCount; i++)
            {
                var daysAgo = rand.Next(0, 60);
                var startLoc = locations[rand.Next(locations.Length)];
                var endLoc = locations[rand.Next(locations.Length)];
                while (endLoc == startLoc) endLoc = locations[rand.Next(locations.Length)];

                var transportType = transportTypes[rand.Next(transportTypes.Length)];
                var distance = transportType switch
                {
                    TransportType.Walking => Math.Round(rand.NextDouble() * 3 + 0.5, 1),  // 0.5-3.5 km
                    TransportType.Biking => Math.Round(rand.NextDouble() * 10 + 2, 1),   // 2-12 km
                    TransportType.Bus => Math.Round(rand.NextDouble() * 8 + 3, 1),        // 3-11 km
                    TransportType.Tram => Math.Round(rand.NextDouble() * 9 + 3, 1),       // 3-12 km
                    TransportType.Metro => Math.Round(rand.NextDouble() * 12 + 4, 1),     // 4-16 km
                    TransportType.Car => Math.Round(rand.NextDouble() * 15 + 5, 1),       // 5-20 km
                    _ => 5.0
                };

                var duration = transportType switch
                {
                    TransportType.Walking => (int)(distance * 12),    // ~12 min/km
                    TransportType.Biking => (int)(distance * 4),      // ~4 min/km
                    TransportType.Bus => (int)(distance * 3 + 5),
                    TransportType.Tram => (int)(distance * 3.5 + 4),
                    TransportType.Metro => (int)(distance * 2.5 + 3),
                    TransportType.Car => (int)(distance * 2),
                    _ => 20
                };

                var calories = transportType switch
                {
                    TransportType.Walking => distance * 50,           // ~50 kcal/km
                    TransportType.Biking => distance * 40,            // ~40 kcal/km
                    _ => 0
                };

                // CO2 saved vs mașină (mașina = ~0.225 kg CO2/km)
                var co2 = transportType switch
                {
                    TransportType.Walking => distance * 0.225,
                    TransportType.Biking => distance * 0.225,
                    TransportType.Bus => distance * 0.15,       // 67% mai puțin decât mașina
                    TransportType.Tram => distance * 0.17,
                    TransportType.Metro => distance * 0.16,
                    TransportType.Car => 0,
                    _ => 0
                };

                var startTime = DateTime.Now.AddDays(-daysAgo).AddHours(rand.Next(7, 20)).AddMinutes(rand.Next(0, 60));

                trips.Add(new Trip
                {
                    UserId = userId,
                    StartLocation = startLoc,
                    EndLocation = endLoc,
                    Distance = distance,
                    Duration = duration,
                    TransportType = transportType,
                    CaloriesBurned = Math.Round(calories, 0),
                    Co2Saved = Math.Round(co2, 2),
                    StartTime = startTime,
                    EndTime = startTime.AddMinutes(duration),
                    IsVerified = rand.Next(100) < 85  // 85% verified
                });
            }

            // Sortează trips cronologic
            trips = trips.OrderBy(t => t.StartTime).ToList();
            context.Trips.AddRange(trips);

            // Update stats
            stats.TotalTrips = trips.Count;
            stats.TotalDistance = Math.Round(trips.Sum(t => t.Distance), 1);
            stats.TotalCo2Saved = Math.Round(trips.Sum(t => t.Co2Saved), 2);
            stats.TotalCaloriesBurned = Math.Round(trips.Sum(t => t.CaloriesBurned), 0);
            stats.LastUpdated = DateTime.Now;
        }

        /// <summary>
        /// Populează catalogul de achievement-uri posibile.
        /// Acestea sunt evaluate dinamic in DashboardController.
        /// </summary>
        private static async Task SeedAchievementDefinitions(ApplicationDbContext context, ILogger logger)
        {
            if (await context.AchievementDefinitions.AnyAsync())
            {
                logger.LogInformation("Achievement definitions există deja.");
                return;
            }

            var definitions = new List<AchievementDefinition>
            {
                // ── Trips ──
                new() { Name = "Prima Călătorie",     Description = "Finalizează prima ta călătorie eco",    Icon = "bi-compass",        ConditionType = "trips",    ConditionValue = 1 },
                new() { Name = "Explorator",          Description = "Completează 10 călătorii",               Icon = "bi-map",            ConditionType = "trips",    ConditionValue = 10 },
                new() { Name = "Călător Dedicat",     Description = "Completează 50 călătorii",               Icon = "bi-signpost-2",     ConditionType = "trips",    ConditionValue = 50 },
                new() { Name = "Maratonist Eco",      Description = "Completează 100 călătorii",              Icon = "bi-trophy",         ConditionType = "trips",    ConditionValue = 100 },
                new() { Name = "Legendă Urbană",      Description = "Completează 500 călătorii",              Icon = "bi-stars",          ConditionType = "trips",    ConditionValue = 500 },

                // ── Distance ──
                new() { Name = "Primii 10 km",        Description = "Parcurge 10 km în total",                Icon = "bi-geo-alt",        ConditionType = "distance", ConditionValue = 10 },
                new() { Name = "Biciclist Pro",       Description = "Parcurge 50 km în total",                Icon = "bi-bicycle",        ConditionType = "distance", ConditionValue = 50 },
                new() { Name = "Centurion",           Description = "Parcurge 100 km în total",               Icon = "bi-speedometer2",   ConditionType = "distance", ConditionValue = 100 },
                new() { Name = "Ultra Runner",        Description = "Parcurge 500 km în total",               Icon = "bi-lightning",      ConditionType = "distance", ConditionValue = 500 },
                new() { Name = "Ocolul Pământului",   Description = "Parcurge 1000 km în total",              Icon = "bi-globe-americas", ConditionType = "distance", ConditionValue = 1000 },

                // ── CO₂ ──
                new() { Name = "Eco Starter",         Description = "Salvează 5 kg CO₂",                     Icon = "bi-cloud-minus",    ConditionType = "co2",      ConditionValue = 5 },
                new() { Name = "Eco Champion",        Description = "Salvează 50 kg CO₂",                    Icon = "bi-trophy-fill",    ConditionType = "co2",      ConditionValue = 50 },
                new() { Name = "Eco Hero",            Description = "Salvează 200 kg CO₂",                   Icon = "bi-shield-check",   ConditionType = "co2",      ConditionValue = 200 },
                new() { Name = "Planet Saver",        Description = "Salvează 1000 kg CO₂",                  Icon = "bi-globe2",         ConditionType = "co2",      ConditionValue = 1000 },

                // ── Calories ──
                new() { Name = "Primele Calorii",     Description = "Arde 500 kcal prin transport eco",       Icon = "bi-fire",           ConditionType = "calories", ConditionValue = 500 },
                new() { Name = "Fitness Warrior",     Description = "Arde 5000 kcal prin transport eco",      Icon = "bi-heart-pulse",    ConditionType = "calories", ConditionValue = 5000 },
                new() { Name = "Iron Eco",            Description = "Arde 20000 kcal prin transport eco",     Icon = "bi-award-fill",     ConditionType = "calories", ConditionValue = 20000 }
            };

            context.AchievementDefinitions.AddRange(definitions);
            await context.SaveChangesAsync();
            logger.LogInformation($"{definitions.Count} achievement definitions au fost create.");
        }
    }
}
