/* ═══════════════════════════════════════════════════════════════════════
   ECOPATH — WEATHER MOTIVATIONAL SYSTEM (JavaScript Module)
   
   Architecture:
   ─────────────
   Browser Geolocation → Controller API → WeatherService → OpenWeatherMap
   
   Flow:
   1. Detect location once via navigator.geolocation
   2. Fetch /api/weather?lat=...&lon=...&ecoScore=... 
   3. Render weather card with animated transitions
   4. Start real-time clock (uses timezone offset from API)
   5. Poll for new weather + quote every 15 min
   6. Rotate quotes client-side every 45s between polls
   
   Performance:
   ─────────────
   • Single geolocation request (cached by browser)
   • 15-min polling interval matches server cache TTL
   • All animations use transform + opacity (GPU composited)
   • No jQuery — pure modern JS
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ═══════ CONFIG ═══════
    const POLL_INTERVAL = 15 * 60 * 1000;   // 15 minutes
    const QUOTE_ROTATE_INTERVAL = 45 * 1000; // 45 seconds
    const GEO_TIMEOUT = 10000;               // 10s geolocation timeout
    const FALLBACK_LAT = 44.4268;            // Bucharest default
    const FALLBACK_LON = 26.1025;

    // ═══════ STATE ═══════
    let currentWeather = null;
    let timezoneOffset = null;     // UTC offset in seconds from API
    let clockInterval = null;
    let pollInterval = null;
    let quoteRotateInterval = null;
    let lastDigits = '0000';       // For digit flip animation (HH:MM)

    // ═══════ DOM REFERENCES ═══════
    const hero = document.getElementById('weather-hero');
    if (!hero) return; // Not on dashboard or not authenticated — bail silently

    // ═══════ INITIALIZATION ═══════
    init();

    async function init() {
        showLoadingState();
        const coords = await getUserLocation();
        await fetchAndRender(coords.lat, coords.lon);
        startClock();
        startPolling(coords.lat, coords.lon);
        startQuoteRotation(coords.lat, coords.lon);
    }

    // ═══════════════════════════════════════════════════════════════
    // §1  GEOLOCATION
    // ═══════════════════════════════════════════════════════════════

    function getUserLocation() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve({ lat: FALLBACK_LAT, lon: FALLBACK_LON });
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    console.log('EcoPath: Geolocation acquired', pos.coords.latitude, pos.coords.longitude);
                    resolve({
                        lat: pos.coords.latitude,
                        lon: pos.coords.longitude
                    });
                },
                (err) => {
                    console.warn('EcoPath: Geolocation failed, using Bucharest fallback.', err.message);
                    resolve({ lat: FALLBACK_LAT, lon: FALLBACK_LON });
                },
                {
                    enableHighAccuracy: true,
                    timeout: GEO_TIMEOUT,
                    maximumAge: 300000 // Cache for 5 min
                }
            );
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // §2  FETCH WEATHER FROM BACKEND
    // ═══════════════════════════════════════════════════════════════

    async function fetchWeather(lat, lon) {
        const ecoScore = getEcoScore();
        const url = `/api/weather?lat=${lat}&lon=${lon}&ecoScore=${ecoScore}`;

        const response = await fetch(url, {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error(`Weather API ${response.status}`);
        return await response.json();
    }

    function getEcoScore() {
        // Read eco score from dashboard data attribute if available
        const el = document.querySelector('[data-eco-score]');
        return el ? parseFloat(el.getAttribute('data-eco-score')) || 0 : 0;
    }

    // ═══════════════════════════════════════════════════════════════
    // §3  RENDER WEATHER
    // ═══════════════════════════════════════════════════════════════

    async function fetchAndRender(lat, lon) {
        try {
            const data = await fetchWeather(lat, lon);
            currentWeather = data;
            timezoneOffset = data.timezoneOffset;

            // If the backend returned fallback data (API key invalid, network error, etc.)
            // show a friendly fallback UI instead of rendering 0s everywhere
            if (data.success === false) {
                console.warn('EcoPath Weather: API returned fallback data (service unavailable).');
                renderFallback(data.quote, data.quoteAuthor);
                return;
            }

            renderWeather(data);
        } catch (err) {
            console.warn('EcoPath Weather: Fetch failed, showing fallback.', err);
            renderFallback();
        }
    }

    function renderWeather(data) {
        // Set weather type for CSS adaptation
        hero.setAttribute('data-weather', data.weatherType);
        hero.classList.remove('loading');

        // Generate weather particles
        const particlesHtml = generateParticles(data.weatherType);

        hero.innerHTML = `
            <div class="weather-particles">${particlesHtml}</div>
            
            <div class="weather-left">
                <div class="weather-temp-row">
                    <img class="weather-icon-animated weather-icon-morph" 
                         src="https://openweathermap.org/img/wn/${data.icon}@2x.png" 
                         alt="${data.description}"
                         loading="lazy" />
                    <div>
                        <div class="weather-temp">
                            <span class="weather-temp-value">${Math.round(data.temperature)}</span><span class="weather-temp-unit">°C</span>
                        </div>
                    </div>
                </div>
                <div class="weather-city">
                    <i class="bi bi-geo-alt-fill"></i> 
                    ${data.city}${data.country ? ', ' + data.country : ''}
                </div>
                <div class="weather-desc">${data.description}</div>
            </div>

            <div class="weather-center">
                <div class="weather-clock-time" id="weather-clock">
                    <span class="clock-digit">0</span><span class="clock-digit">0</span><span class="clock-separator">:</span><span class="clock-digit">0</span><span class="clock-digit">0</span>
                </div>
                <div class="weather-clock-label">Ora locală</div>
            </div>

            <div class="weather-right">
                <div class="weather-details-grid">
                    <div class="weather-detail-item">
                        <i class="bi bi-thermometer-half"></i>
                        <span class="weather-detail-value">${data.feelsLike}°</span>
                        <span class="weather-detail-label">Simte ca</span>
                    </div>
                    <div class="weather-detail-item">
                        <i class="bi bi-droplet-half"></i>
                        <span class="weather-detail-value">${data.humidity}%</span>
                        <span class="weather-detail-label">Umiditate</span>
                    </div>
                    <div class="weather-detail-item">
                        <i class="bi bi-wind"></i>
                        <span class="weather-detail-value">${data.windSpeed} m/s</span>
                        <span class="weather-detail-label">Vânt</span>
                    </div>
                    <div class="weather-detail-item">
                        <i class="bi bi-sunrise"></i>
                        <span class="weather-detail-value">${formatUnixTime(data.sunrise, data.timezoneOffset)}</span>
                        <span class="weather-detail-label">Răsărit</span>
                    </div>
                </div>
            </div>

            <div class="weather-quote-banner">
                <div class="weather-quote-inner fade-in" id="weather-quote">
                    <p class="weather-quote-text">${data.quote}</p>
                    <div class="weather-quote-author">— ${data.quoteAuthor}</div>
                </div>
            </div>
        `;

        // Animate temperature counter
        animateTemperature(data.temperature);

        // Update clock immediately
        updateClock();
    }

    function renderFallback(quote, quoteAuthor) {
        hero.setAttribute('data-weather', 'clear');
        hero.classList.remove('loading');

        const displayQuote = quote || 'Fiecare călătorie eco contează. Începe azi!';
        const displayAuthor = quoteAuthor || 'EcoPath';

        hero.innerHTML = `
            <div class="weather-particles"><div class="sun-ray"></div></div>
            <div class="weather-left">
                <div class="weather-temp-row">
                    <i class="bi bi-cloud-slash" style="font-size:3rem; color:rgba(255,255,255,0.7);"></i>
                    <div>
                        <div class="weather-temp">
                            <span class="weather-temp-value" style="font-size:1.4rem;">—</span>
                        </div>
                    </div>
                </div>
                <div class="weather-city"><i class="bi bi-geo-alt-fill"></i> Serviciul meteo indisponibil</div>
                <div class="weather-desc">Datele meteo vor fi disponibile în curând</div>
            </div>
            <div class="weather-center">
                <div class="weather-clock-time" id="weather-clock">
                    <span class="clock-digit">0</span><span class="clock-digit">0</span><span class="clock-separator">:</span><span class="clock-digit">0</span><span class="clock-digit">0</span>
                </div>
                <div class="weather-clock-label">Ora locală</div>
            </div>
            <div class="weather-right">
                <div class="weather-details-grid">
                    <div class="weather-detail-item"><i class="bi bi-info-circle"></i><span class="weather-detail-value">—</span><span class="weather-detail-label">Reîncearcă în 15 min</span></div>
                </div>
            </div>
            <div class="weather-quote-banner">
                <div class="weather-quote-inner fade-in" id="weather-quote">
                    <p class="weather-quote-text">${displayQuote}</p>
                    <div class="weather-quote-author">— ${displayAuthor}</div>
                </div>
            </div>
        `;

        updateClock();
    }

    // ═══════════════════════════════════════════════════════════════
    // §4  LOADING STATE (Shimmer)
    // ═══════════════════════════════════════════════════════════════

    function showLoadingState() {
        hero.classList.add('loading');
        hero.removeAttribute('data-weather');
        hero.innerHTML = `
            <div class="weather-left">
                <div class="weather-temp-row">
                    <div class="weather-shimmer shimmer-temp"></div>
                </div>
                <div class="weather-shimmer shimmer-text-lg"></div>
                <div class="weather-shimmer shimmer-text-sm"></div>
            </div>
            <div class="weather-center">
                <div class="weather-shimmer shimmer-clock"></div>
            </div>
            <div class="weather-right">
                <div class="weather-details-grid">
                    <div class="weather-shimmer" style="height: 50px; border-radius: 12px;"></div>
                    <div class="weather-shimmer" style="height: 50px; border-radius: 12px;"></div>
                    <div class="weather-shimmer" style="height: 50px; border-radius: 12px;"></div>
                    <div class="weather-shimmer" style="height: 50px; border-radius: 12px;"></div>
                </div>
            </div>
            <div class="weather-quote-banner">
                <div class="weather-shimmer shimmer-quote"></div>
            </div>
        `;
    }

    // ═══════════════════════════════════════════════════════════════
    // §5  REAL-TIME CLOCK
    // ═══════════════════════════════════════════════════════════════

    function startClock() {
        if (clockInterval) clearInterval(clockInterval);
        clockInterval = setInterval(updateClock, 1000);
    }

    function updateClock() {
        const clockEl = document.getElementById('weather-clock');
        if (!clockEl) return;

        let now;
        if (timezoneOffset !== null) {
            // Use API timezone for accurate local time at user's detected location
            const utc = Date.now() + (new Date().getTimezoneOffset() * 60000);
            now = new Date(utc + (timezoneOffset * 1000));
        } else {
            // Fallback: browser local time
            now = new Date();
        }

        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const newDigits = h + m;

        const digits = clockEl.querySelectorAll('.clock-digit');
        if (digits.length === 4) {
            for (let i = 0; i < 4; i++) {
                if (newDigits[i] !== lastDigits[i]) {
                    digits[i].textContent = newDigits[i];
                    // Trigger flip animation
                    digits[i].classList.remove('flip');
                    void digits[i].offsetWidth; // Force reflow
                    digits[i].classList.add('flip');
                }
            }
            lastDigits = newDigits;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // §6  SMART POLLING (15-min interval)
    // ═══════════════════════════════════════════════════════════════

    function startPolling(lat, lon) {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(() => fetchAndRender(lat, lon), POLL_INTERVAL);
    }

    // ═══════════════════════════════════════════════════════════════
    // §7  QUOTE ROTATION (client-side between polls)
    // ═══════════════════════════════════════════════════════════════

    function startQuoteRotation(lat, lon) {
        if (quoteRotateInterval) clearInterval(quoteRotateInterval);
        quoteRotateInterval = setInterval(async () => {
            try {
                const data = await fetchWeather(lat, lon);
                const quoteEl = document.getElementById('weather-quote');
                if (!quoteEl || data.quote === quoteEl.querySelector('.weather-quote-text')?.textContent) return;

                // Fade out
                quoteEl.classList.remove('fade-in');
                quoteEl.classList.add('fade-out');

                setTimeout(() => {
                    quoteEl.querySelector('.weather-quote-text').textContent = data.quote;
                    quoteEl.querySelector('.weather-quote-author').textContent = `— ${data.quoteAuthor}`;

                    // Fade in
                    quoteEl.classList.remove('fade-out');
                    quoteEl.classList.add('fade-in');
                }, 400);
            } catch (e) {
                // Silently ignore quote rotation failures
            }
        }, QUOTE_ROTATE_INTERVAL);
    }

    // ═══════════════════════════════════════════════════════════════
    // §8  WEATHER PARTICLES GENERATOR
    // ═══════════════════════════════════════════════════════════════

    function generateParticles(weatherType) {
        let html = '';

        switch (weatherType) {
            case 'rain':
            case 'drizzle':
                for (let i = 0; i < 30; i++) {
                    const left = Math.random() * 100;
                    const duration = 0.6 + Math.random() * 0.8;
                    const delay = Math.random() * 2;
                    const height = 15 + Math.random() * 15;
                    html += `<div class="rain-drop" style="left:${left}%;animation-duration:${duration}s;animation-delay:${delay}s;height:${height}px;"></div>`;
                }
                break;

            case 'thunderstorm':
                for (let i = 0; i < 40; i++) {
                    const left = Math.random() * 100;
                    const duration = 0.4 + Math.random() * 0.6;
                    const delay = Math.random() * 2;
                    html += `<div class="rain-drop" style="left:${left}%;animation-duration:${duration}s;animation-delay:${delay}s;"></div>`;
                }
                html += '<div class="lightning-flash"></div>';
                break;

            case 'snow':
                for (let i = 0; i < 25; i++) {
                    const left = Math.random() * 100;
                    const duration = 3 + Math.random() * 4;
                    const delay = Math.random() * 3;
                    const size = 4 + Math.random() * 6;
                    html += `<div class="snow-flake" style="left:${left}%;animation-duration:${duration}s;animation-delay:${delay}s;width:${size}px;height:${size}px;"></div>`;
                }
                break;

            case 'clear':
                html += '<div class="sun-ray"></div>';
                break;

            case 'clouds':
            case 'mist':
                for (let i = 0; i < 4; i++) {
                    const top = 10 + Math.random() * 60;
                    const duration = 20 + Math.random() * 20;
                    const delay = Math.random() * 10;
                    const size = 80 + Math.random() * 120;
                    html += `<div class="cloud-shape" style="top:${top}%;animation-duration:${duration}s;animation-delay:${delay}s;width:${size}px;height:${size * 0.6}px;"></div>`;
                }
                break;
        }

        return html;
    }

    // ═══════════════════════════════════════════════════════════════
    // §9  ANIMATED TEMPERATURE COUNTER
    // ═══════════════════════════════════════════════════════════════

    function animateTemperature(target) {
        const el = hero.querySelector('.weather-temp-value');
        if (!el) return;

        const start = 0;
        const duration = 1200;
        const startTime = performance.now();

        function step(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // easeOutExpo
            const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            const current = Math.round(start + (target - start) * eased);
            el.textContent = current;

            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }
        requestAnimationFrame(step);
    }

    // ═══════════════════════════════════════════════════════════════
    // §10  UTILITY
    // ═══════════════════════════════════════════════════════════════

    function formatUnixTime(unix, tzOffset) {
        if (!unix) return '—';
        const date = new Date((unix + tzOffset) * 1000);
        const h = String(date.getUTCHours()).padStart(2, '0');
        const m = String(date.getUTCMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    }

    // ═══════════════════════════════════════════════════════════════
    // §11  ECO MICRO-ANIMATIONS (Global utilities)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Trigger leaf burst animation at a specific element.
     * Call: window.EcoPath.leafBurst(element)
     */
    function leafBurst(target) {
        const rect = target.getBoundingClientRect();
        const container = document.createElement('div');
        container.className = 'eco-leaf-burst';
        container.style.left = (rect.left + rect.width / 2) + 'px';
        container.style.top = (rect.top + rect.height / 2) + 'px';

        const leaves = ['🍃', '🌿', '🌱', '☘️', '🍀'];
        for (let i = 0; i < 8; i++) {
            const leaf = document.createElement('span');
            leaf.className = 'eco-leaf-particle';
            leaf.textContent = leaves[Math.floor(Math.random() * leaves.length)];
            leaf.style.setProperty('--leaf-x', (Math.random() * 120 - 60) + 'px');
            leaf.style.setProperty('--leaf-y', (-40 - Math.random() * 80) + 'px');
            leaf.style.setProperty('--leaf-r', (Math.random() * 360) + 'deg');
            leaf.style.animationDelay = (Math.random() * 0.2) + 's';
            container.appendChild(leaf);
        }

        document.body.appendChild(container);
        setTimeout(() => container.remove(), 1500);
    }

    /**
     * Trigger confetti burst (for activity logging).
     * Call: window.EcoPath.confettiBurst()
     */
    function confettiBurst() {
        const container = document.createElement('div');
        container.className = 'eco-confetti-container';

        const colors = ['#10B981', '#059669', '#34D399', '#FFB347', '#3B82F6', '#8B5CF6'];
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 3;

        for (let i = 0; i < 40; i++) {
            const piece = document.createElement('div');
            piece.className = 'eco-confetti-piece';
            piece.style.left = centerX + 'px';
            piece.style.top = centerY + 'px';
            piece.style.background = colors[Math.floor(Math.random() * colors.length)];
            piece.style.setProperty('--confetti-x', (Math.random() * 400 - 200) + 'px');
            piece.style.setProperty('--confetti-y', (Math.random() * 300 + 100) + 'px');
            piece.style.setProperty('--confetti-r', (Math.random() * 720) + 'deg');
            piece.style.animationDelay = (Math.random() * 0.3) + 's';
            piece.style.width = (4 + Math.random() * 6) + 'px';
            piece.style.height = (4 + Math.random() * 6) + 'px';
            piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
            container.appendChild(piece);
        }

        document.body.appendChild(container);
        setTimeout(() => container.remove(), 2500);
    }

    /**
     * Trigger glow pulse on an element.
     * Call: window.EcoPath.glowPulse(element)
     */
    function glowPulse(target) {
        target.classList.add('eco-glow-pulse');
        target.addEventListener('animationend', () => {
            target.classList.remove('eco-glow-pulse');
        }, { once: true });
    }

    // Expose utilities globally for other scripts
    window.EcoPath = window.EcoPath || {};
    window.EcoPath.leafBurst = leafBurst;
    window.EcoPath.confettiBurst = confettiBurst;
    window.EcoPath.glowPulse = glowPulse;

})();
