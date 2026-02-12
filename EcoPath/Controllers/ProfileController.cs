using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using EcoPath.Data;
using EcoPath.Models;

namespace EcoPath.Controllers
{
    [Authorize]
    public class ProfileController : Controller
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly ApplicationDbContext _context;

        public ProfileController(UserManager<ApplicationUser> userManager, ApplicationDbContext context)
        {
            _userManager = userManager;
            _context = context;
        }

        public async Task<IActionResult> Index()
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null)
            {
                return NotFound();
            }

            // Load user with related data
            var userWithData = await _context.Users
                .Include(u => u.Stats)
                .Include(u => u.Achievements)
                .Include(u => u.Trips.OrderByDescending(t => t.StartTime).Take(5))
                .FirstOrDefaultAsync(u => u.Id == user.Id);

            if (userWithData == null)
            {
                return NotFound();
            }

            return View(userWithData);
        }

        [HttpGet]
        public async Task<IActionResult> Edit()
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null)
            {
                return NotFound();
            }

            var viewModel = new ProfileEditViewModel
            {
                UserName = user.UserName ?? string.Empty,
                Email = user.Email ?? string.Empty,
                City = user.City,
                Weight = user.Weight,
                PhoneNumber = user.PhoneNumber ?? string.Empty
            };

            return View(viewModel);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(ProfileEditViewModel model)
        {
            if (!ModelState.IsValid)
            {
                return View(model);
            }

            var user = await _userManager.GetUserAsync(User);
            if (user == null)
            {
                return NotFound();
            }

            // Check if username is being changed and if it's already taken
            if (user.UserName != model.UserName)
            {
                var existingUser = await _userManager.FindByNameAsync(model.UserName);
                if (existingUser != null)
                {
                    ModelState.AddModelError("UserName", "Acest nume de utilizator este deja folosit.");
                    return View(model);
                }
                user.UserName = model.UserName;
            }

            user.City = model.City;
            user.Weight = model.Weight;
            user.PhoneNumber = model.PhoneNumber;

            var result = await _userManager.UpdateAsync(user);
            
            if (result.Succeeded)
            {
                TempData["SuccessMessage"] = "Profilul a fost actualizat cu succes!";
                return RedirectToAction(nameof(Index));
            }

            foreach (var error in result.Errors)
            {
                ModelState.AddModelError(string.Empty, error.Description);
            }

            return View(model);
        }
    }

    public class ProfileEditViewModel
    {
        public string UserName { get; set; } = string.Empty;
        
        public string Email { get; set; } = string.Empty;
        
        public string City { get; set; } = string.Empty;
        
        public double Weight { get; set; }
        
        public string PhoneNumber { get; set; } = string.Empty;
    }
}
