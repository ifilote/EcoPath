/* ╔══════════════════════════════════════════════════════════════════════════════╗
   ║  ECOPATH — GLOBAL JAVASCRIPT                                              ║
   ║  Theme toggle, Ripple effects, Confetti system, Global interactions       ║
   ╚══════════════════════════════════════════════════════════════════════════════╝ */

document.addEventListener('DOMContentLoaded', () => {

    // ═══════ 1. DARK / LIGHT THEME TOGGLE ═══════
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');
    const html = document.documentElement;

    function setTheme(theme) {
        html.setAttribute('data-theme', theme);
        localStorage.setItem('ecopath-theme', theme);
        if (themeIcon) {
            themeIcon.className = theme === 'dark'
                ? 'bi bi-sun-fill'
                : 'bi bi-moon-stars';
        }
        // Update meta theme-color for mobile
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.content = theme === 'dark' ? '#0A0F1C' : '#F0FDF4';
        }
    }

    // Initialize icon based on current theme
    const currentTheme = html.getAttribute('data-theme') || 'light';
    setTheme(currentTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = html.getAttribute('data-theme');
            setTheme(current === 'dark' ? 'light' : 'dark');
        });
    }

    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('ecopath-theme')) {
            setTheme(e.matches ? 'dark' : 'light');
        }
    });


    // ═══════ 2. RIPPLE EFFECT ═══════
    // Add ripple effect to buttons that have .eco-ripple class
    document.querySelectorAll('.eco-ripple').forEach(el => {
        el.addEventListener('click', function(e) {
            const circle = document.createElement('span');
            circle.classList.add('ripple-circle');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            circle.style.width = circle.style.height = size + 'px';
            circle.style.left = (e.clientX - rect.left - size / 2) + 'px';
            circle.style.top = (e.clientY - rect.top - size / 2) + 'px';
            this.appendChild(circle);
            circle.addEventListener('animationend', () => circle.remove());
        });
    });


    // ═══════ 3. CONFETTI BURST ═══════
    // Call window.ecoConfetti(x, y) to trigger a confetti burst at position
    window.ecoConfetti = function(x, y) {
        const container = document.createElement('div');
        container.className = 'eco-confetti-container';
        container.style.left = x + 'px';
        container.style.top = y + 'px';
        document.body.appendChild(container);

        const colors = ['#10B981', '#FFD700', '#0D9488', '#34D399', '#FBBF24', '#FFFFFF', '#22D3EE'];
        const shapes = ['', 'eco-confetti-particle--leaf', 'eco-confetti-particle--diamond'];

        for (let i = 0; i < 18; i++) {
            const particle = document.createElement('div');
            const shape = shapes[Math.floor(Math.random() * shapes.length)];
            particle.className = `eco-confetti-particle ${shape}`;
            const size = 4 + Math.random() * 6;
            particle.style.width = size + 'px';
            particle.style.height = size + 'px';
            particle.style.background = colors[Math.floor(Math.random() * colors.length)];

            // Random direction
            const angle = (Math.PI * 2 / 18) * i + (Math.random() * 0.5 - 0.25);
            const velocity = 60 + Math.random() * 100;
            const tx = Math.cos(angle) * velocity;
            const ty = Math.sin(angle) * velocity - 20; // slight upward bias
            const rotation = Math.random() * 720 - 360;

            particle.style.setProperty('--tx', tx + 'px');
            particle.style.setProperty('--ty', ty + 'px');
            particle.style.animation = `confettiBurst ${1 + Math.random() * 0.5}s ease-out forwards`;
            particle.style.transform = `translate(${tx}px, ${ty}px) rotate(${rotation}deg)`;
            particle.style.animationDelay = (Math.random() * 0.1) + 's';

            container.appendChild(particle);
        }

        setTimeout(() => container.remove(), 2000);
    };


    // ═══════ 4. INTERSECTION OBSERVER ANIMATION TRIGGERS ═══════
    // Animate elements when they enter the viewport
    const animateObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-visible');
                animateObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.animate-on-scroll').forEach(el => {
        animateObserver.observe(el);
    });


    // ═══════ 5. SMOOTH SCROLL FOR ANCHOR LINKS ═══════
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });


    // ═══════ 6. NAVBAR SCROLL EFFECT ═══════
    // Add shadow and compact padding on scroll
    const navbar = document.querySelector('.eco-navbar');
    if (navbar) {
        let lastScroll = 0;
        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            if (scrollY > 20) {
                navbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)';
            } else {
                navbar.style.boxShadow = 'none';
            }
            lastScroll = scrollY;
        }, { passive: true });
    }
});
