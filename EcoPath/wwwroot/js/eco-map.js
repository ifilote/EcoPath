let map, directionsService;
let currentRoutesData = []; // Salvăm rutele aici pentru a le putea modifica la click/hover
let selectedRouteIndex = 0;
let startMarker, endMarker;
let pinMode = 'IDLE';

function togglePanel(show) {
    const panel = document.getElementById('main-panel');
    if (show) panel.classList.remove('minimized');
    else panel.classList.add('minimized');
}

function initEcoMap() {
    const centerLoc = { lat: 44.4268, lng: 26.1025 };

    map = new google.maps.Map(document.getElementById("map"), {
        center: centerLoc,
        zoom: 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER }
    });

    directionsService = new google.maps.DirectionsService();

    // Autocomplete
    const startInput = document.getElementById('start-input');
    const endInput = document.getElementById('end-input');
    new google.maps.places.Autocomplete(startInput).bindTo('bounds', map);
    new google.maps.places.Autocomplete(endInput).bindTo('bounds', map);

    // Event Listeners pentru Pin-uri
    document.getElementById('btn-pin-start').addEventListener('click', () => setPinMode('PICK_START'));
    document.getElementById('btn-pin-end').addEventListener('click', () => setPinMode('PICK_END'));

    map.addListener('click', (e) => {
        if (pinMode === 'PICK_START') {
            placeMarker(e.latLng, 'START');
            reverseGeocode(e.latLng, startInput);
            setPinMode('IDLE');
        } else if (pinMode === 'PICK_END') {
            placeMarker(e.latLng, 'END');
            reverseGeocode(e.latLng, endInput);
            setPinMode('IDLE');
        }
    });

    document.getElementById('calc-route-btn').addEventListener('click', calculateMainRoute);
}

function setPinMode(mode) {
    pinMode = mode;
    const btnStart = document.getElementById('btn-pin-start');
    const btnEnd = document.getElementById('btn-pin-end');

    btnStart.classList.remove('active');
    btnEnd.classList.remove('active');
    map.setOptions({ draggableCursor: null });

    if (mode === 'PICK_START') {
        btnStart.classList.add('active');
        map.setOptions({ draggableCursor: 'crosshair' });
    } else if (mode === 'PICK_END') {
        btnEnd.classList.add('active');
        map.setOptions({ draggableCursor: 'crosshair' });
    }
}

function placeMarker(latLng, type) {
    if (type === 'START') {
        if (startMarker) startMarker.setMap(null);
        startMarker = new google.maps.Marker({ position: latLng, map: map, icon: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png' });
    } else {
        if (endMarker) endMarker.setMap(null);
        endMarker = new google.maps.Marker({ position: latLng, map: map, icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png' });
    }
}

function reverseGeocode(latLng, inputElement) {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: latLng }, (results, status) => {
        if (status === "OK" && results[0]) inputElement.value = results[0].formatted_address;
        else inputElement.value = `${latLng.lat().toFixed(4)}, ${latLng.lng().toFixed(4)}`;
    });
}

function clearRoutes() {
    currentRoutesData.forEach(data => data.renderer.setMap(null));
    currentRoutesData = [];
    document.getElementById('eco-suggestion-container').innerHTML = '';
}

function calculateMainRoute() {
    const start = document.getElementById('start-input').value;
    const end = document.getElementById('end-input').value;
    const mode = document.querySelector('input[name="travelMode"]:checked').value;

    if (!start || !end) return alert("Selectează locațiile!");

    clearRoutes();
    document.getElementById('results-container').classList.remove('d-none');
    document.getElementById('results-content').innerHTML = '<div class="text-center my-3"><div class="spinner-border text-success" role="status"></div></div>';

    const request = {
        origin: start,
        destination: end,
        travelMode: google.maps.TravelMode[mode],
        provideRouteAlternatives: true,
        drivingOptions: mode === 'DRIVING' ? { departureTime: new Date(), trafficModel: 'bestguess' } : undefined
    };

    directionsService.route(request, (result, status) => {
        if (status === 'OK') {
            renderInteractiveRoutes(result, mode);

            // Sugestii Smart Eco în fundal
            if (mode === 'DRIVING') {
                const bestDist = result.routes[0].legs[0].distance.value / 1000;
                const bestTime = result.routes[0].legs[0].duration.value / 60;
                checkEcoAlternative(start, end, 'TRANSIT', bestTime, bestDist);
                if (bestDist <= 15) checkEcoAlternative(start, end, 'BICYCLING', bestTime, bestDist);
            }
        } else {
            document.getElementById('results-content').innerHTML = '<span class="text-danger">Nu am găsit rute.</span>';
        }
    });
}

// ─── NOUA FUNCȚIE DE RANDARE INTERACTIVĂ ───
function renderInteractiveRoutes(result, mode) {
    const container = document.getElementById('results-content');
    container.innerHTML = ''; // Curățăm spinner-ul
    selectedRouteIndex = 0; // Resetăm selecția

    // Afișăm maxim 3 rute pentru a nu aglomera ecranul
    const routesToShow = result.routes.slice(0, 3);
    const themeColor = (mode === 'DRIVING') ? '#3B82F6' : '#10B981'; // Albastru pt mașină, Verde pt Eco

    routesToShow.forEach((route, index) => {
        const leg = route.legs[0];
        const distKm = leg.distance.value / 1000;
        let emissions = (mode === 'DRIVING') ? distKm * 0.12 : (mode === 'TRANSIT' ? distKm * 0.06 : 0);

        const isBest = index === 0;

        // Desenăm ruta pe hartă
        const renderer = new google.maps.DirectionsRenderer({
            map: map,
            directions: result,
            routeIndex: index,
            suppressMarkers: true,
            polylineOptions: {
                strokeColor: isBest ? themeColor : '#9CA3AF', // Cele inactive sunt gri
                strokeWeight: isBest ? 6 : 4,
                zIndex: isBest ? 10 : 1
            }
        });

        // Creăm Cardul HTML ca obiect DOM (nu string), ca să îi punem event listeners
        const card = document.createElement('div');
        card.className = `card shadow-sm mb-2 transition-all ${isBest ? 'border-primary border-2' : 'border-light'}`;
        card.style.cursor = 'pointer';

        // Dacă e eco, facem highlight verde la text, altfel albastru/default
        const titleColorClass = isBest ? (mode === 'DRIVING' ? 'text-primary' : 'text-success') : 'text-muted';
        const badgeClass = emissions === 0 ? 'bg-success' : (isBest ? 'bg-primary' : 'bg-secondary');

        card.innerHTML = `
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <strong class="${titleColorClass} title-text">${route.summary || 'Traseu Alternativ'}</strong>
                    <span class="badge ${badgeClass} emissions-badge">${emissions.toFixed(1)} kg CO₂</span>
                </div>
                <div class="d-flex justify-content-between text-muted small">
                    <span><i class="bi bi-clock"></i> <strong>${leg.duration.text}</strong></span>
                    <span><i class="bi bi-signpost-split"></i> ${leg.distance.text}</span>
                </div>
            </div>
        `;

        container.appendChild(card);

        // Salvăm datele pentru a le folosi la hover/click
        currentRoutesData.push({ index, renderer, card, themeColor, inactiveColor: '#9CA3AF' });

        // ─── EVENIMENTELE TALE MAGICE ───
        card.addEventListener('click', () => selectRoute(index, mode));
        card.addEventListener('mouseenter', () => hoverRoute(index, true));
        card.addEventListener('mouseleave', () => hoverRoute(index, false));
    });
}

function selectRoute(clickedIndex, mode) {
    selectedRouteIndex = clickedIndex;

    currentRoutesData.forEach(data => {
        const isSelected = data.index === clickedIndex;

        // 1. Modificăm linia de pe hartă
        data.renderer.setOptions({
            polylineOptions: {
                strokeColor: isSelected ? data.themeColor : data.inactiveColor,
                strokeWeight: isSelected ? 6 : 4,
                zIndex: isSelected ? 10 : 1
            }
        });

        // 2. Modificăm stilul cardului
        const title = data.card.querySelector('.title-text');
        const badge = data.card.querySelector('.emissions-badge');

        if (isSelected) {
            data.card.classList.add('border-primary', 'border-2');
            data.card.classList.remove('border-light', 'bg-light');

            title.classList.remove('text-muted');
            title.classList.add(mode === 'DRIVING' ? 'text-primary' : 'text-success');

            if (!badge.classList.contains('bg-success')) { // Dacă nu e 0 emisii
                badge.classList.remove('bg-secondary');
                badge.classList.add('bg-primary');
            }
        } else {
            data.card.classList.remove('border-primary', 'border-2');
            data.card.classList.add('border-light');

            title.classList.add('text-muted');
            title.classList.remove('text-primary', 'text-success');

            if (!badge.classList.contains('bg-success')) {
                badge.classList.add('bg-secondary');
                badge.classList.remove('bg-primary');
            }
        }
    });
}

function hoverRoute(hoveredIndex, isHovering) {
    if (hoveredIndex === selectedRouteIndex) return; // Nu modificăm ruta deja selectată (aia principală)

    const data = currentRoutesData[hoveredIndex];

    // Când dăm hover, facem ruta de pe hartă un gri mai închis și un pic mai groasă ca să iasă în evidență
    data.renderer.setOptions({
        polylineOptions: {
            strokeColor: isHovering ? '#4B5563' : data.inactiveColor,
            strokeWeight: isHovering ? 5 : 4,
            zIndex: isHovering ? 5 : 1
        }
    });

    // Punem un fundal gri deschis pe card
    if (isHovering) {
        data.card.classList.add('bg-light');
    } else {
        data.card.classList.remove('bg-light');
    }
}

function checkEcoAlternative(start, end, altMode, originalTimeMins, originalDist) {
    const request = { origin: start, destination: end, travelMode: google.maps.TravelMode[altMode] };

    directionsService.route(request, (result, status) => {
        if (status === 'OK') {
            const leg = result.routes[0].legs[0];
            const altTimeMins = leg.duration.value / 60;
            let shouldSuggest = false;
            let title = "", icon = "";

            if (altMode === 'BICYCLING' && altTimeMins <= originalTimeMins * 1.5) {
                shouldSuggest = true; title = "Bate traficul pe bicicletă!"; icon = "bi-bicycle";
            } else if (altMode === 'TRANSIT' && altTimeMins <= originalTimeMins + 20) {
                shouldSuggest = true; title = "Alege transportul în comun!"; icon = "bi-bus-front";
            }

            if (shouldSuggest) {
                const savedCo2 = (originalDist * 0.12) - (altMode === 'TRANSIT' ? (leg.distance.value / 1000 * 0.06) : 0);
                document.getElementById('eco-suggestion-container').innerHTML += `
                    <div class="alert alert-success border-success mt-2 mb-0 p-2 shadow-sm">
                        <div class="d-flex align-items-center mb-1">
                            <i class="bi ${icon} fs-5 me-2"></i>
                            <strong class="small">Sugestie EcoPath: ${title}</strong>
                        </div>
                        <p class="mb-0 small text-dark">
                            Durează <strong>${leg.duration.text}</strong> și salvezi <strong>${savedCo2.toFixed(1)} kg CO₂</strong> comparativ cu mașina.
                        </p>
                    </div>`;
            }
        }
    });
}