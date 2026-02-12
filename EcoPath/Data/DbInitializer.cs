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
                    UserName = adminEmail,
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
    }
}
