using System.Diagnostics;
using EcoPath.Models;
using Microsoft.AspNetCore.Mvc;

namespace EcoPath.Controllers
{
    public class HomeController : Controller
    {
        private readonly ILogger<HomeController> _logger; 
        private readonly IConfiguration _configuration;

        public HomeController(ILogger<HomeController> logger, IConfiguration configuration)
        {
            _logger = logger;
            _configuration = configuration;
        }

        public IActionResult Index()
        {
            return View();
        }

        public IActionResult Privacy()
        {
            return View();
        }

        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }
        public IActionResult Map()
        {
            var model = new MapViewModel
            {
                // Luăm cheia din appsettings.json
                GoogleMapsApiKey = _configuration["GoogleMaps:ApiKey"] ?? ""
            };

            return View(model);
        }
    }
}
