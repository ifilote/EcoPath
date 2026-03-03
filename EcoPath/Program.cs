using EcoPath.Data;
using EcoPath.Models;
using EcoPath.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection") ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlite(connectionString)); 
builder.Services.AddDatabaseDeveloperPageExceptionFilter();

builder.Services.AddDefaultIdentity<ApplicationUser>(options => options.SignIn.RequireConfirmedAccount = false)
    .AddRoles<IdentityRole>() 
    .AddEntityFrameworkStores<ApplicationDbContext>();
builder.Services.AddControllersWithViews();

// ═══════ Weather + Quote Services ═══════
// HttpClient: managed pool via IHttpClientFactory — prevents socket exhaustion
builder.Services.AddHttpClient("WeatherApi", client =>
{
    client.Timeout = TimeSpan.FromSeconds(10);
    client.DefaultRequestHeaders.Add("Accept", "application/json");
});
// MemoryCache: 15-min TTL for weather data — matches POLL_INTERVAL on frontend
builder.Services.AddMemoryCache();
// Scoped: one WeatherService per request (uses HttpClient + Cache)
builder.Services.AddScoped<IWeatherService, WeatherService>();
// Singleton: QuoteService holds static data + thread-safe last-index tracker
builder.Services.AddSingleton<IQuoteService, QuoteService>();

// ═══════ ML.NET RECOMMENDATION SERVICE ═══════
builder.Services.AddScoped<IRecommendationService, RecommendationService>();

var app = builder.Build();

// ═══════ INITIALIZE ML MODEL ON STARTUP ═══════
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        // Migrate database
        var dbContext = services.GetRequiredService<ApplicationDbContext>();
        await dbContext.Database.MigrateAsync();

        // Initialize DB with seed data
        await DbInitializer.Initialize(services);

        // Initialize ML recommendation engine (blocking)
        var recommendationService = services.GetRequiredService<IRecommendationService>();
        await recommendationService.InitializeAsync();

        services.GetRequiredService<ILogger<Program>>().LogInformation("✓ All services initialized successfully.");
    }
    catch (Exception ex)
    {
        services.GetRequiredService<ILogger<Program>>().LogError(ex, "❌ Error during startup initialization.");
    }
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseMigrationsEndPoint();
}
else
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();

app.UseAuthorization();

app.MapStaticAssets();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();

app.MapRazorPages()
   .WithStaticAssets();

app.Run();
