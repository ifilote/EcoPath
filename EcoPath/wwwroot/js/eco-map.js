/**
 * ═══════════════════════════════════════════════════════════════
 *  EcoPath — Advanced Google Maps Integration
 *  Features: Geolocation, Live Tracking, Auto-Routing,
 *            Styled Map, Smooth Animations, Eco Suggestions
 * ═══════════════════════════════════════════════════════════════
 */

/* ─── Module-scoped state (no global pollution) ─── */
const EcoMap = (() => {
    'use strict';

    // ── Core Google Maps objects ──
    let map = null;
    let directionsService = null;

    // ── Markers ──
    let userMarker = null;        // Custom marker for user's live location
    let destinationMarker = null; // Marker for selected destination
    let userAccuracyCircle = null;

    // ── Route state ──
    let currentRoutesData = [];
    let selectedRouteIndex = 0;

    // ── Geolocation state ──
    let userLatLng = null;        // Current user position {lat, lng}
    let watchId = null;           // watchPosition ID
    let hasInitialLocation = false;

    // ── Debounce timer for live route updates ──
    let routeUpdateTimer = null;
    const ROUTE_UPDATE_DEBOUNCE = 5000; // 5s debounce for live rerouting

    // ── Minimum movement threshold (meters) to trigger marker update ──
    const MIN_MOVE_THRESHOLD = 5;

    // ═══════════════════════════════════════════════════════════
    //  1. ECO GREEN MAP STYLE — Nature-inspired with green tones
    // ═══════════════════════════════════════════════════════════
    const MAP_STYLES = [
        // Base geometry: soft warm white-green
        { elementType: 'geometry', stylers: [{ color: '#eef5e9' }] },
        // Hide default POI icons for a cleaner look
        { elementType: 'labels.icon', stylers: [{ visibility: 'simplified' }] },
        // Label text: dark green tint
        { elementType: 'labels.text.fill', stylers: [{ color: '#4a6741' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#f0f7ec' }] },
        // Administrative labels
        {
            featureType: 'administrative',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#b5d6a7' }]
        },
        {
            featureType: 'administrative.land_parcel',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#8aab7f' }]
        },
        // POI: light green tones
        {
            featureType: 'poi',
            elementType: 'geometry',
            stylers: [{ color: '#d4e8cc' }]
        },
        {
            featureType: 'poi',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#5a7a50' }]
        },
        // Parks: vivid green — the hero of the map
        {
            featureType: 'poi.park',
            elementType: 'geometry.fill',
            stylers: [{ color: '#a8d5a2' }]
        },
        {
            featureType: 'poi.park',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#2e7d32' }]
        },
        // Roads: clean white with subtle green undertone
        {
            featureType: 'road',
            elementType: 'geometry.fill',
            stylers: [{ color: '#ffffff' }]
        },
        {
            featureType: 'road',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#c8dfc0' }]
        },
        {
            featureType: 'road.arterial',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#5a7a50' }]
        },
        // Highways: gentle sage green
        {
            featureType: 'road.highway',
            elementType: 'geometry.fill',
            stylers: [{ color: '#d7eacf' }]
        },
        {
            featureType: 'road.highway',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#b0cfaa' }]
        },
        {
            featureType: 'road.highway',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#4a6741' }]
        },
        // Local roads: subtle labels
        {
            featureType: 'road.local',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#7a9e6e' }]
        },
        // Transit: light green-gray
        {
            featureType: 'transit.line',
            elementType: 'geometry',
            stylers: [{ color: '#c8dfc0' }]
        },
        {
            featureType: 'transit.station',
            elementType: 'geometry',
            stylers: [{ color: '#d4e8cc' }]
        },
        // Water: fresh blue-green (teal)
        {
            featureType: 'water',
            elementType: 'geometry.fill',
            stylers: [{ color: '#a3d5d3' }]
        },
        {
            featureType: 'water',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#1a736e' }]
        },
        // Landscape: natural feel
        {
            featureType: 'landscape.natural',
            elementType: 'geometry.fill',
            stylers: [{ color: '#ddefd6' }]
        },
        {
            featureType: 'landscape.man_made',
            elementType: 'geometry.fill',
            stylers: [{ color: '#e8f0e4' }]
        }
    ];

    // ═══════════════════════════════════════════════════════════
    //  2. CUSTOM SVG MARKER for user location (pulsing dot)
    //  NOTE: These use google.maps.* so they are built lazily
    //  inside init() after the API has loaded.
    // ═══════════════════════════════════════════════════════════
    let USER_MARKER_SVG = null;
    let DESTINATION_MARKER_SVG = null;

    /** Build marker icons (must be called after google.maps is ready) */
    function buildMarkerIcons() {
        USER_MARKER_SVG = {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: '#4285F4',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
            scale: 10
        };

        DESTINATION_MARKER_SVG = {
            path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z',
            fillColor: '#EF4444',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
            scale: 1.8,
            anchor: new google.maps.Point(12, 22)
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  3. INITIALIZATION — Entry point called by Google Maps API
    // ═══════════════════════════════════════════════════════════
    function init() {
        showLoading(true);

        // Build marker icons now that google.maps is available
        buildMarkerIcons();

        // Default center: Bucharest (fallback if geolocation fails)
        const defaultCenter = { lat: 44.4268, lng: 26.1025 };

        map = new google.maps.Map(document.getElementById('map'), {
            center: defaultCenter,
            zoom: 13,
            styles: MAP_STYLES,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            zoomControl: true,
            zoomControlOptions: {
                position: google.maps.ControlPosition.RIGHT_CENTER
            },
            gestureHandling: 'greedy', // Better mobile experience
            clickableIcons: false       // Cleaner map
        });

        directionsService = new google.maps.DirectionsService();

        // Setup destination autocomplete (Places API)
        setupAutocomplete();

        // Setup transport mode buttons
        setupTransportModes();

        // Setup map click for destination selection
        setupMapClickDestination();

        // Setup manual "Locate Me" button
        setupLocateButton();

        // Start geolocation (this is the primary feature)
        initGeolocation();
    }

    // ═══════════════════════════════════════════════════════════
    //  4. GEOLOCATION — Auto-detect + Live tracking
    // ═══════════════════════════════════════════════════════════

    /** Initial geolocation with high accuracy */
    function initGeolocation() {
        if (!navigator.geolocation) {
            showLocationError('Browserul tău nu suportă geolocalizarea.');
            showLoading(false);
            return;
        }

        // Get initial position with high accuracy
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                userLatLng = { lat: latitude, lng: longitude };
                hasInitialLocation = true;

                // Zoom in on user location
                map.setCenter(userLatLng);
                map.setZoom(16);

                // Place the custom user marker
                createUserMarker(userLatLng, accuracy);

                // Fill the start input automatically
                reverseGeocode(userLatLng, document.getElementById('start-input'));

                showLoading(false);
                showLocationStatus('Locația ta a fost detectată', 'success');

                // Start live tracking with watchPosition
                startLiveTracking();
            },
            (error) => {
                handleGeolocationError(error);
                showLoading(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }
        );
    }

    /** Continuous location updates via watchPosition */
    function startLiveTracking() {
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                const newLatLng = { lat: latitude, lng: longitude };

                // Only update if moved more than threshold
                if (userLatLng && getDistanceMeters(userLatLng, newLatLng) < MIN_MOVE_THRESHOLD) {
                    return;
                }

                const oldLatLng = userLatLng;
                userLatLng = newLatLng;

                // Smoothly animate marker to new position
                animateMarkerTo(userMarker, oldLatLng, newLatLng);

                // Update accuracy circle
                if (userAccuracyCircle) {
                    userAccuracyCircle.setCenter(newLatLng);
                    userAccuracyCircle.setRadius(accuracy);
                }

                // Debounced route update if route is active
                if (currentRoutesData.length > 0 && destinationMarker) {
                    debouncedRouteUpdate();
                }
            },
            (error) => {
                console.warn('Live tracking error:', error.message);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 3000
            }
        );
    }

    /** Create the user marker with pulsing accuracy circle */
    function createUserMarker(latLng, accuracy) {
        // Accuracy circle (subtle blue translucent)
        userAccuracyCircle = new google.maps.Circle({
            map,
            center: latLng,
            radius: accuracy,
            fillColor: '#4285F4',
            fillOpacity: 0.1,
            strokeColor: '#4285F4',
            strokeOpacity: 0.3,
            strokeWeight: 1,
            clickable: false
        });

        // Custom styled marker
        userMarker = new google.maps.Marker({
            position: latLng,
            map,
            icon: USER_MARKER_SVG,
            title: 'Locația ta',
            zIndex: 999,
            optimized: false // Required for smooth animations
        });
    }

    /** Smooth marker animation between two positions */
    function animateMarkerTo(marker, fromLatLng, toLatLng) {
        if (!marker || !fromLatLng) {
            marker?.setPosition(toLatLng);
            return;
        }

        const frames = 30;
        const duration = 500; // ms
        let frame = 0;

        const deltaLat = (toLatLng.lat - fromLatLng.lat) / frames;
        const deltaLng = (toLatLng.lng - fromLatLng.lng) / frames;

        const animate = () => {
            frame++;
            const lat = fromLatLng.lat + deltaLat * frame;
            const lng = fromLatLng.lng + deltaLng * frame;
            marker.setPosition({ lat, lng });

            if (frame < frames) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    /** Haversine distance between two {lat, lng} objects (meters) */
    function getDistanceMeters(a, b) {
        const R = 6371000;
        const dLat = (b.lat - a.lat) * Math.PI / 180;
        const dLng = (b.lng - a.lng) * Math.PI / 180;
        const sinLat = Math.sin(dLat / 2);
        const sinLng = Math.sin(dLng / 2);
        const aVal = sinLat * sinLat +
            Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLng * sinLng;
        return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
    }

    /** Handle geolocation errors gracefully */
    function handleGeolocationError(error) {
        const messages = {
            1: 'Accesul la locație a fost refuzat. Activează locația din setările browserului.',
            2: 'Nu s-a putut determina locația. Verifică GPS-ul.',
            3: 'Timpul de așteptare pentru locație a expirat. Încearcă din nou.'
        };
        showLocationError(messages[error.code] || 'Eroare necunoscută de geolocalizare.');
    }

    // ═══════════════════════════════════════════════════════════
    //  5. DESTINATION SELECTION — Click on map or Autocomplete
    // ═══════════════════════════════════════════════════════════

    /** Setup Google Places Autocomplete on destination input */
    function setupAutocomplete() {
        const destInput = document.getElementById('dest-input');

        const autocomplete = new google.maps.places.Autocomplete(destInput, {
            types: ['geocode', 'establishment'],
            fields: ['geometry', 'formatted_address', 'name']
        });

        autocomplete.bindTo('bounds', map);

        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (!place.geometry?.location) return;

            const latLng = {
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng()
            };

            setDestination(latLng, place.formatted_address || place.name);
        });
    }

    /** Allow clicking on the map to set destination */
    function setupMapClickDestination() {
        map.addListener('click', (e) => {
            const latLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
            const destInput = document.getElementById('dest-input');

            setDestination(latLng);
            reverseGeocode(latLng, destInput);
        });
    }

    /** Set destination, place marker, and auto-calculate route */
    function setDestination(latLng, label = null) {
        // Place or move destination marker
        if (destinationMarker) {
            destinationMarker.setPosition(latLng);
        } else {
            destinationMarker = new google.maps.Marker({
                position: latLng,
                map,
                icon: DESTINATION_MARKER_SVG,
                title: 'Destinație',
                animation: google.maps.Animation.DROP,
                zIndex: 998
            });
        }

        if (label) {
            document.getElementById('dest-input').value = label;
        }

        // Auto-calculate route if we have user location
        if (userLatLng) {
            calculateRoute();
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  6. TRANSPORT MODE SELECTION
    // ═══════════════════════════════════════════════════════════

    function setupTransportModes() {
        const buttons = document.querySelectorAll('.transport-btn');

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active state
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Recalculate if destination exists
                if (destinationMarker && userLatLng) {
                    calculateRoute();
                }
            });
        });
    }

    /** Get currently selected travel mode */
    function getSelectedMode() {
        const activeBtn = document.querySelector('.transport-btn.active');
        return activeBtn?.dataset.mode || 'DRIVING';
    }

    // ═══════════════════════════════════════════════════════════
    //  7. ROUTE CALCULATION — Core routing engine
    // ═══════════════════════════════════════════════════════════

    function calculateRoute() {
        if (!userLatLng || !destinationMarker) return;

        const mode = getSelectedMode();
        const destPos = destinationMarker.getPosition();

        clearRoutes();

        // Show loading state in results
        showResultsPanel(true);
        const container = document.getElementById('results-content');
        container.innerHTML = `
            <div class="eco-loading-routes">
                <div class="eco-spinner"></div>
                <span>Se calculează rutele...</span>
            </div>`;

        // Build route request
        const request = {
            origin: new google.maps.LatLng(userLatLng.lat, userLatLng.lng),
            destination: destPos,
            travelMode: google.maps.TravelMode[mode],
            provideRouteAlternatives: true
        };

        // Add driving-specific options
        if (mode === 'DRIVING') {
            request.drivingOptions = {
                departureTime: new Date(),
                trafficModel: 'bestguess'
            };
        }

        // For BICYCLING: Use WALKING mode (which works everywhere and
        // prefers smaller streets/paths) then adjust displayed time.
        // Average cycling speed ~15 km/h vs walking ~5 km/h → factor of 3x faster.
        const actualApiMode = (mode === 'BICYCLING') ? 'WALKING' : mode;
        request.travelMode = google.maps.TravelMode[actualApiMode];

        directionsService.route(request, (result, status) => {
            if (status === 'OK') {
                renderInteractiveRoutes(result, mode, mode === 'BICYCLING');
                fitBoundsToRoute(result.routes[0]);

                // Eco suggestions if driving
                if (mode === 'DRIVING') {
                    const leg = result.routes[0].legs[0];
                    const bestDist = leg.distance.value / 1000;
                    const bestTime = leg.duration.value / 60;
                    checkEcoAlternative('TRANSIT', bestTime, bestDist);
                    checkEcoAlternative('WALKING', bestTime, bestDist); // walking as bike proxy
                }
            } else {
                container.innerHTML = `
                    <div class="eco-no-routes">
                        <i class="bi bi-exclamation-triangle"></i>
                        <span>Nu am găsit rute pentru acest mod de transport.</span>
                    </div>`;
            }
        });
    }

    /** Zoom to fit the entire route on screen */
    function fitBoundsToRoute(route) {
        const bounds = new google.maps.LatLngBounds();
        route.legs.forEach(leg => {
            leg.steps.forEach(step => {
                bounds.extend(step.start_location);
                bounds.extend(step.end_location);
            });
        });

        // Also include user marker
        if (userLatLng) {
            bounds.extend(new google.maps.LatLng(userLatLng.lat, userLatLng.lng));
        }

        map.fitBounds(bounds, { top: 80, bottom: 40, left: 420, right: 40 });
    }

    /** Debounced route recalculation for live updates */
    function debouncedRouteUpdate() {
        clearTimeout(routeUpdateTimer);
        routeUpdateTimer = setTimeout(() => {
            calculateRoute();
        }, ROUTE_UPDATE_DEBOUNCE);
    }

    // ═══════════════════════════════════════════════════════════
    //  8. INTERACTIVE ROUTE RENDERING with cards + hover/click
    // ═══════════════════════════════════════════════════════════

    /** Convert seconds to a human-readable duration string */
    function formatDuration(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const mins = Math.round((totalSeconds % 3600) / 60);
        if (hours > 0) return `${hours} h ${mins} min`;
        return `${mins} min`;
    }

    function renderInteractiveRoutes(result, mode, isBikeFallback = false) {
        const container = document.getElementById('results-content');
        container.innerHTML = '';
        selectedRouteIndex = 0;

        const routesToShow = result.routes.slice(0, 3);
        const themeColor = (mode === 'DRIVING') ? '#3B82F6' : '#10B981';

        // Bike fallback: walking routes ÷ 3 for cycling speed (~15km/h vs ~5km/h)
        const BIKE_SPEED_FACTOR = 3;

        routesToShow.forEach((route, index) => {
            const leg = route.legs[0];
            const distKm = leg.distance.value / 1000;
            const emissions = (mode === 'DRIVING')
                ? distKm * 0.12
                : (mode === 'TRANSIT' ? distKm * 0.06 : 0);

            // Adjust duration for bicycling (walking route / 3)
            let displayDuration = leg.duration.text;
            if (isBikeFallback) {
                const bikeSecs = Math.round(leg.duration.value / BIKE_SPEED_FACTOR);
                displayDuration = formatDuration(bikeSecs);
            }

            const isBest = index === 0;

            // Create DirectionsRenderer for this route
            const renderer = new google.maps.DirectionsRenderer({
                map,
                directions: result,
                routeIndex: index,
                suppressMarkers: true,
                polylineOptions: {
                    strokeColor: isBest ? themeColor : '#9CA3AF',
                    strokeWeight: isBest ? 6 : 4,
                    strokeOpacity: isBest ? 0.9 : 0.5,
                    zIndex: isBest ? 10 : 1
                }
            });

            // Build route card
            const card = document.createElement('div');
            card.className = `eco-route-card ${isBest ? 'eco-route-card--active' : ''}`;
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');

            const emissionClass = emissions === 0 ? 'eco-badge--green' : (isBest ? 'eco-badge--blue' : 'eco-badge--gray');
            const modeIcon = getModeIcon(mode);

            card.innerHTML = `
                <div class="eco-route-card__header">
                    <div class="eco-route-card__title">
                        <i class="bi ${modeIcon}"></i>
                        <strong>${route.summary || 'Traseu Alternativ'}</strong>
                    </div>
                    <span class="eco-badge ${emissionClass}">${emissions.toFixed(1)} kg CO₂</span>
                </div>
                <div class="eco-route-card__details">
                    <span><i class="bi bi-clock"></i> ${displayDuration}</span>
                    <span><i class="bi bi-signpost-split"></i> ${leg.distance.text}</span>
                </div>
            `;

            container.appendChild(card);

            // Store route data including the full result for re-rendering
            currentRoutesData.push({
                index, renderer, card, themeColor,
                inactiveColor: '#9CA3AF',
                directions: result  // keep reference for route re-selection
            });

            // Interactive events
            card.addEventListener('click', () => selectRoute(index, mode));
            card.addEventListener('mouseenter', () => hoverRoute(index, true));
            card.addEventListener('mouseleave', () => hoverRoute(index, false));
        });
    }

    function selectRoute(clickedIndex, mode) {
        selectedRouteIndex = clickedIndex;

        // DirectionsRenderer.setOptions doesn't visually refresh polylines reliably.
        // Recreate each renderer with the correct style for guaranteed visual update.
        currentRoutesData.forEach(data => {
            const isSelected = data.index === clickedIndex;

            // Remove old renderer from the map
            data.renderer.setMap(null);

            // Recreate with updated polyline style
            data.renderer = new google.maps.DirectionsRenderer({
                map,
                directions: data.directions,
                routeIndex: data.index,
                suppressMarkers: true,
                polylineOptions: {
                    strokeColor: isSelected ? data.themeColor : data.inactiveColor,
                    strokeWeight: isSelected ? 6 : 4,
                    strokeOpacity: isSelected ? 0.9 : 0.5,
                    zIndex: isSelected ? 10 : 1
                }
            });

            // Update card style
            if (isSelected) {
                data.card.classList.add('eco-route-card--active');
            } else {
                data.card.classList.remove('eco-route-card--active');
            }
        });
    }

    function hoverRoute(hoveredIndex, isHovering) {
        if (hoveredIndex === selectedRouteIndex) return;

        const data = currentRoutesData[hoveredIndex];

        // Recreate renderer for proper visual update on hover
        data.renderer.setMap(null);
        data.renderer = new google.maps.DirectionsRenderer({
            map,
            directions: data.directions,
            routeIndex: data.index,
            suppressMarkers: true,
            polylineOptions: {
                strokeColor: isHovering ? '#4B5563' : data.inactiveColor,
                strokeWeight: isHovering ? 5 : 4,
                strokeOpacity: isHovering ? 0.7 : 0.5,
                zIndex: isHovering ? 5 : 1
            }
        });

        if (isHovering) {
            data.card.classList.add('eco-route-card--hover');
        } else {
            data.card.classList.remove('eco-route-card--hover');
        }
    }

    /** Clear all rendered routes from map */
    function clearRoutes() {
        currentRoutesData.forEach(data => data.renderer.setMap(null));
        currentRoutesData = [];
        document.getElementById('eco-suggestion-container').innerHTML = '';
    }

    // ═══════════════════════════════════════════════════════════
    //  9. ECO ALTERNATIVE SUGGESTIONS
    // ═══════════════════════════════════════════════════════════

    function checkEcoAlternative(altMode, originalTimeMins, originalDist) {
        if (!userLatLng || !destinationMarker) return;

        const request = {
            origin: new google.maps.LatLng(userLatLng.lat, userLatLng.lng),
            destination: destinationMarker.getPosition(),
            travelMode: google.maps.TravelMode[altMode]
        };

        directionsService.route(request, (result, status) => {
            if (status !== 'OK') return;

            const leg = result.routes[0].legs[0];
            const altTimeMins = leg.duration.value / 60;
            let shouldSuggest = false;
            let title = '', icon = '';

            if (altMode === 'WALKING' && (altTimeMins / 3) <= originalTimeMins * 1.5) {
                // Walking route ÷ 3 = approximate bike time
                shouldSuggest = true;
                title = 'Bate traficul pe bicicletă!';
                icon = 'bi-bicycle';
            } else if (altMode === 'TRANSIT' && altTimeMins <= originalTimeMins + 20) {
                shouldSuggest = true;
                title = 'Alege transportul în comun!';
                icon = 'bi-bus-front';
            }

            if (shouldSuggest) {
                const savedCo2 = (originalDist * 0.12) -
                    (altMode === 'TRANSIT' ? (leg.distance.value / 1000 * 0.06) : 0);

                // For bike suggestions, show adjusted time (walking / 3)
                const displayTime = (altMode === 'WALKING')
                    ? formatDuration(Math.round(leg.duration.value / 3))
                    : leg.duration.text;

                const suggestionEl = document.getElementById('eco-suggestion-container');
                suggestionEl.innerHTML += `
                    <div class="eco-suggestion">
                        <div class="eco-suggestion__icon">
                            <i class="bi ${icon}"></i>
                        </div>
                        <div class="eco-suggestion__content">
                            <strong>Sugestie EcoPath: ${title}</strong>
                            <p>Durează <strong>${displayTime}</strong> și salvezi
                               <strong>${savedCo2.toFixed(1)} kg CO₂</strong> față de mașină.</p>
                        </div>
                    </div>`;
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  10. UTILITY FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    /** Reverse geocode a LatLng and fill an input field */
    function reverseGeocode(latLng, inputElement) {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: latLng }, (results, status) => {
            if (status === 'OK' && results[0]) {
                inputElement.value = results[0].formatted_address;
            } else {
                inputElement.value = `${latLng.lat.toFixed(4)}, ${latLng.lng.toFixed(4)}`;
            }
        });
    }

    /** Get Bootstrap icon class for a travel mode */
    function getModeIcon(mode) {
        const icons = {
            DRIVING: 'bi-car-front',
            TRANSIT: 'bi-bus-front',
            BICYCLING: 'bi-bicycle',
            WALKING: 'bi-person-walking'
        };
        return icons[mode] || 'bi-geo-alt';
    }

    // ═══════════════════════════════════════════════════════════
    //  11. UI HELPERS — Loading, errors, panel toggling
    // ═══════════════════════════════════════════════════════════

    /** "Locate Me" button handler */
    function setupLocateButton() {
        const btn = document.getElementById('locate-me-btn');
        if (!btn) return;

        btn.addEventListener('click', () => {
            if (userLatLng) {
                map.panTo(userLatLng);
                map.setZoom(16);
            } else {
                initGeolocation();
            }
        });
    }

    /** Toggle floating panel visibility */
    function togglePanel(show) {
        const panel = document.getElementById('main-panel');
        if (show) {
            panel.classList.remove('minimized');
        } else {
            panel.classList.add('minimized');
        }
    }

    /** Show or hide results panel */
    function showResultsPanel(visible) {
        const el = document.getElementById('results-container');
        if (visible) el.classList.remove('eco-hidden');
        else el.classList.add('eco-hidden');
    }

    /** Show/hide the loading overlay */
    function showLoading(visible) {
        const loader = document.getElementById('map-loader');
        if (loader) {
            loader.style.display = visible ? 'flex' : 'none';
        }
    }

    /** Show a temporary location status toast */
    function showLocationStatus(message, type = 'info') {
        const el = document.getElementById('location-status');
        if (!el) return;

        el.textContent = message;
        el.className = `eco-location-status eco-location-status--${type} eco-location-status--visible`;

        setTimeout(() => {
            el.classList.remove('eco-location-status--visible');
        }, 3000);
    }

    /** Show geolocation error */
    function showLocationError(message) {
        showLocationStatus(message, 'error');
        // Also show in the start input as hint
        const startInput = document.getElementById('start-input');
        if (startInput) {
            startInput.value = '';
            startInput.placeholder = 'Locație nedisponibilă — activează GPS';
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  12. PUBLIC API — Exposed to global scope for callbacks
    // ═══════════════════════════════════════════════════════════

    return {
        init,
        togglePanel
    };

})(); // End IIFE

// ── Global callback for Google Maps script loader ──
function initEcoMap() {
    EcoMap.init();
}

// ── Global togglePanel for inline onclick in HTML ──
function togglePanel(show) {
    EcoMap.togglePanel(show);
}