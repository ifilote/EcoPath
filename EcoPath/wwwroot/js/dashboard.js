/* ═══════════════════════════════════════════════
   ECOPATH DASHBOARD — JavaScript
   Chart.js charts, Cal-Heatmap, Animations, AJAX
   ═══════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

    // ═══════ 1. ANIMATED COUNTERS ═══════
    // Numerele din overview cards cresc animat de la 0 la valoarea reala
    const counters = document.querySelectorAll('.overview-value');
    const animateCounter = (el) => {
        const target = parseFloat(el.getAttribute('data-count'));
        const isDecimal = target % 1 !== 0;
        const duration = 1500;
        const startTime = performance.now();

        const step = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // easeOutExpo for smooth deceleration
            const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            const current = eased * target;

            el.textContent = isDecimal ? current.toFixed(1) : Math.floor(current).toLocaleString('ro-RO');

            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    };

    // Trigger counters when cards become visible (IntersectionObserver)
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                counterObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(c => counterObserver.observe(c));

    // ═══════ 2. ANIMATE PROGRESS BARS ═══════
    // Barele de progress pornesc de la 0 si cresc catre valoarea reala
    const progressObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const fill = entry.target;
                const width = fill.getAttribute('data-width');
                fill.style.width = width + '%';
                progressObserver.unobserve(fill);
            }
        });
    }, { threshold: 0.3 });

    document.querySelectorAll('.progress-fill').forEach(f => {
        f.style.width = '0';
        progressObserver.observe(f);
    });

    // ═══════ 3. CHART.JS CONFIG ═══════
    const COLORS = {
        green: '#10B981',
        greenLight: 'rgba(16, 185, 129, 0.15)',
        blue: '#3B82F6',
        blueLight: 'rgba(59, 130, 246, 0.15)',
        purple: '#8B5CF6',
        orange: '#F59E0B',
        pink: '#EC4899',
        red: '#EF4444',
        gray: '#9CA3AF'
    };

    // Ordinea zilelor saptamanii
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayLabels = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];

    // Sorteaza datele pe zilele saptamanii
    const sortByDay = (data) => {
        return dayOrder.map((day, i) => ({
            label: dayLabels[i],
            value: data[day] || 0
        }));
    };

    // ── 3a. Weekly Trips Bar Chart ──
    const weeklyTripsCtx = document.getElementById('weeklyTripsChart');
    if (weeklyTripsCtx) {
        const sorted = sortByDay(CHART_DATA.weeklyTrips);
        new Chart(weeklyTripsCtx, {
            type: 'bar',
            data: {
                labels: sorted.map(d => d.label),
                datasets: [{
                    label: 'Călătorii',
                    data: sorted.map(d => d.value),
                    backgroundColor: sorted.map((_, i) => {
                        const colors = [COLORS.green, COLORS.blue, COLORS.purple, COLORS.orange, COLORS.pink, COLORS.green, COLORS.blue];
                        return colors[i % colors.length];
                    }),
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1F2937',
                        titleFont: { weight: '700' },
                        cornerRadius: 10,
                        padding: 12
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, font: { weight: '600' } },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    x: {
                        ticks: { font: { weight: '600' } },
                        grid: { display: false }
                    }
                },
                animation: { duration: 1200, easing: 'easeOutQuart' }
            }
        });
    }

    // ── 3b. Weekly CO₂ Line Chart ──
    const weeklyCo2Ctx = document.getElementById('weeklyCo2Chart');
    if (weeklyCo2Ctx) {
        const sorted = sortByDay(CHART_DATA.weeklyCo2);
        new Chart(weeklyCo2Ctx, {
            type: 'line',
            data: {
                labels: sorted.map(d => d.label),
                datasets: [{
                    label: 'CO₂ Salvat (kg)',
                    data: sorted.map(d => d.value),
                    borderColor: COLORS.green,
                    backgroundColor: COLORS.greenLight,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: COLORS.green,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1F2937',
                        cornerRadius: 10,
                        padding: 12,
                        callbacks: {
                            label: (ctx) => `${ctx.parsed.y.toFixed(2)} kg CO₂`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { font: { weight: '600' } },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    x: {
                        ticks: { font: { weight: '600' } },
                        grid: { display: false }
                    }
                },
                animation: { duration: 1200, easing: 'easeOutQuart' }
            }
        });
    }

    // ── 3c. Transport Types Doughnut Chart ──
    const transportCtx = document.getElementById('transportChart');
    if (transportCtx) {
        const transportLabels = Object.keys(CHART_DATA.transport);
        const transportValues = Object.values(CHART_DATA.transport);

        // Culori asociate tipurilor de transport
        const transportColorMap = {
            'Walking': COLORS.green,
            'Biking': COLORS.blue,
            'Bus': COLORS.purple,
            'Tram': COLORS.orange,
            'Metro': COLORS.pink,
            'Car': COLORS.red
        };

        const romanianLabels = {
            'Walking': 'Mers pe jos',
            'Biking': 'Bicicletă',
            'Bus': 'Autobuz',
            'Tram': 'Tramvai',
            'Metro': 'Metrou',
            'Car': 'Mașină'
        };

        new Chart(transportCtx, {
            type: 'doughnut',
            data: {
                labels: transportLabels.map(l => romanianLabels[l] || l),
                datasets: [{
                    data: transportValues,
                    backgroundColor: transportLabels.map(l => transportColorMap[l] || COLORS.gray),
                    borderWidth: 3,
                    borderColor: '#fff',
                    hoverBorderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            usePointStyle: true,
                            pointStyleWidth: 12,
                            font: { weight: '600', size: 12 }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#1F2937',
                        cornerRadius: 10,
                        padding: 12,
                        callbacks: {
                            label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                                return `${ctx.label}: ${ctx.parsed} (${pct}%)`;
                            }
                        }
                    }
                },
                animation: { duration: 1200, easing: 'easeOutQuart' }
            }
        });
    }

    // ═══════ 4. CAL-HEATMAP (Calendar Activitate) ═══════
    const calContainer = document.getElementById('cal-heatmap');
    if (calContainer && typeof CalHeatmap !== 'undefined') {
        try {
            const cal = new CalHeatmap();

            // Transforma datele in formatul asteptat de cal-heatmap
            const heatmapData = Object.entries(CHART_DATA.dailyActivity).map(([date, value]) => ({
                date: date,
                value: value
            }));

            cal.paint({
                data: {
                    source: heatmapData,
                    x: 'date',
                    y: 'value',
                    groupY: 'sum'
                },
                date: {
                    start: new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1),
                    locale: 'ro'
                },
                range: 12,
                scale: {
                    color: {
                        type: 'linear',
                        range: ['#D1FAE5', '#10B981', '#065F46'],
                        domain: [0, 5, 20]
                    }
                },
                domain: {
                    type: 'month',
                    gutter: 6,
                    label: { text: 'MMM', textAlign: 'start' }
                },
                subDomain: {
                    type: 'ghDay',
                    radius: 3,
                    width: 14,
                    height: 14,
                    gutter: 3
                },
                itemSelector: '#cal-heatmap'
            }, [
                [
                    typeof Tooltip !== 'undefined' ? Tooltip : null,
                    {
                        text: function (date, value, dayjsDate) {
                            return `${dayjsDate.format('DD MMM YYYY')}: ${(value || 0).toFixed(1)} km`;
                        }
                    }
                ].filter(x => x !== null)
            ].filter(a => a.length > 0));
        } catch (e) {
            // Daca cal-heatmap esueaza, afisam un mesaj simplu
            calContainer.innerHTML = '<div style="text-align:center;padding:2rem;color:#6B7280;">📅 Heatmap-ul necesită mai multe date pentru a fi afișat.</div>';
        }
    }

    // ═══════ 5. SAVE GOALS (AJAX) ═══════
    const saveBtn = document.getElementById('saveGoalsBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const token = document.querySelector('input[name="__RequestVerificationToken"]').value;

            const body = new URLSearchParams({
                weeklyTripGoal: document.getElementById('goalTrips').value,
                weeklyCo2Goal: document.getElementById('goalCo2').value,
                weeklyDistanceGoal: document.getElementById('goalDistance').value,
                weeklyCaloriesGoal: document.getElementById('goalCalories').value,
                __RequestVerificationToken: token
            });

            try {
                saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Se salvează...';
                saveBtn.disabled = true;

                const res = await fetch('/Dashboard/UpdateGoals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: body.toString()
                });

                const data = await res.json();
                if (data.success) {
                    saveBtn.innerHTML = '<i class="bi bi-check-circle-fill"></i> Salvat!';
                    saveBtn.classList.add('btn-saved');
                    setTimeout(() => location.reload(), 800);
                } else {
                    throw new Error('Save failed');
                }
            } catch (err) {
                saveBtn.innerHTML = '<i class="bi bi-exclamation-triangle"></i> Eroare';
                saveBtn.disabled = false;
                setTimeout(() => {
                    saveBtn.innerHTML = '<i class="bi bi-check-lg"></i> Salvează';
                }, 2000);
            }
        });
    }

});
