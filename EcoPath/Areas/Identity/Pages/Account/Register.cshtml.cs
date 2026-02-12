using EcoPath.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.UI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.ComponentModel.DataAnnotations;

namespace EcoPath.Areas.Identity.Pages.Account
{
    public class RegisterModel : PageModel
    {
        private readonly SignInManager<ApplicationUser> _signInManager;
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly ILogger<RegisterModel> _logger;

        public RegisterModel(
            UserManager<ApplicationUser> userManager,
            SignInManager<ApplicationUser> signInManager,
            ILogger<RegisterModel> logger)
        {
            _userManager = userManager;
            _signInManager = signInManager;
            _logger = logger;
        }

        [BindProperty]
        public InputModel Input { get; set; } = default!;

        public string? ReturnUrl { get; set; }

        public IList<AuthenticationScheme> ExternalLogins { get; set; } = new List<AuthenticationScheme>();

        public class InputModel
        {
            [Required(ErrorMessage = "Email-ul este obligatoriu")]
            [EmailAddress(ErrorMessage = "Adresa de email nu este validă")]
            [Display(Name = "Email")]
            public string Email { get; set; } = default!;

            [Required(ErrorMessage = "Parola este obligatorie")]
            [StringLength(100, ErrorMessage = "{0} trebuie să aibă minim {2} și maxim {1} caractere.", MinimumLength = 6)]
            [DataType(DataType.Password)]
            [Display(Name = "Parolă")]
            public string Password { get; set; } = default!;

            [DataType(DataType.Password)]
            [Display(Name = "Confirmă parola")]
            [Compare("Password", ErrorMessage = "Parola și confirmarea nu coincid.")]
            public string ConfirmPassword { get; set; } = default!;


            [Required(ErrorMessage = "Greutatea este obligatorie")]
            [Range(30, 300, ErrorMessage = "Greutatea trebuie să fie între 30 și 300 kg")]
            [Display(Name = "Greutate (kg)")]
            public double Weight { get; set; }

            [Required(ErrorMessage = "Orașul este obligatoriu")]
            [StringLength(100, ErrorMessage = "Numele orașului nu poate depăși 100 de caractere")]
            [Display(Name = "Oraș")]
            public string City { get; set; } = default!;
        }

        public async Task OnGetAsync(string? returnUrl = null)
        {
            ReturnUrl = returnUrl;
            ExternalLogins = (await _signInManager.GetExternalAuthenticationSchemesAsync()).ToList();
        }

        public async Task<IActionResult> OnPostAsync(string? returnUrl = null)
        {
            returnUrl ??= Url.Content("~/");
            ExternalLogins = (await _signInManager.GetExternalAuthenticationSchemesAsync()).ToList();

            if (ModelState.IsValid)
            {
                var user = new ApplicationUser
                {
                    UserName = Input.Email,
                    Email = Input.Email,
                    Weight = Input.Weight,
                    City = Input.City,
                    TotalPoints = 0,        
                    Co2Saved = 0     
                };

                var result = await _userManager.CreateAsync(user, Input.Password);

                if (result.Succeeded)
                {
                    _logger.LogInformation($"Utilizator nou creat: {user.Email} din {user.City}");

                    
                    var userId = await _userManager.GetUserIdAsync(user);
                    var code = await _userManager.GenerateEmailConfirmationTokenAsync(user);

                    await _userManager.ConfirmEmailAsync(user, code);

                    
                    await _signInManager.SignInAsync(user, isPersistent: false);
                    return LocalRedirect(returnUrl);
                }

                
                foreach (var error in result.Errors)
                {
                    ModelState.AddModelError(string.Empty, error.Description);
                }
            }

            return Page();
        }
    }
}
