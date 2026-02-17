using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using EcoPath.Models;
using EcoPath.Data;
using System.Text;

namespace EcoPath.Controllers
{
    [Authorize]
    public class TripController : Controller
    {
        private readonly ApplicationDbContext _context;
        private readonly UserManager<ApplicationUser> _userManager;
        public TripController(ApplicationDbContext context, UserManager<ApplicationUser> userManager)
        {
            _context = context;
            _userManager = userManager;
        }
        public async Task<IActionResult> History()
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null)
            {
                return NotFound();
            }

            var trips = await _context.Trips
                .Where(t => t.UserId == user.Id)
                .OrderByDescending(t => t.StartTime)
                .ToListAsync();

            return View(trips);
        }

        public async Task<IActionResult> Details(int id)
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null)
            {
                return NotFound();
            }

            var trip = await _context.Trips
                .FirstOrDefaultAsync(t => t.Id == id && t.UserId == user.Id);

            if (trip == null)
            {
                return NotFound();
            }

            return View(trip);
        }
    }
}