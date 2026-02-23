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
    let selectedRouteIndex = -1;  // -1 = no route selected yet
    let hasUserSelectedRoute = false; // true after explicit user click

    // ── Geolocation state ──
    let userLatLng = null;        // Current user position {lat, lng}
    let watchId = null;           // watchPosition ID
    let hasInitialLocation = false;

    // ═══════════════════════════════════════════════════════════
    //  MODE COLOR PALETTE — distinct base + shades per transport
    //  Main route  → shades[0] (darkest), thick, high opacity
    //  Alt route 1 → shades[1] (lighter), thin, low opacity
    //  Alt route 2 → shades[2] (lightest), thin, low opacity
    // ═══════════════════════════════════════════════════════════
    const MODE_COLORS = {
        DRIVING:   { base: '#3B82F6', shades: ['#3B82F6', '#60A5FA', '#93C5FD'] },   // Blue
        WALKING:   { base: '#10B981', shades: ['#10B981', '#34D399', '#6EE7B7'] },   // Green
        BICYCLING: { base: '#F59E0B', shades: ['#F59E0B', '#FBBF24', '#FCD34D'] },   // Orange
        TRANSIT:   { base: '#8B5CF6', shades: ['#8B5CF6', '#A78BFA', '#C4B5FD'] }    // Purple
    };

    // ── Debounce timer for live route updates ──
    let routeUpdateTimer = null;
    const ROUTE_UPDATE_DEBOUNCE = 5000; // 5s debounce for live rerouting

    // ── Minimum movement threshold (meters) to trigger marker update ──
    const MIN_MOVE_THRESHOLD = 5;

    // ═══════════════════════════════════════════════════════════
    //  TRIP STATE MACHINE
    //  States: IDLE → ROUTE_SELECTED → NAVIGATING ⇄ PAUSED → FINISHED
    //  Transitions are enforced through setTripState()
    // ═══════════════════════════════════════════════════════════
    const TripState = Object.freeze({
        IDLE:           'IDLE',            // No route selected
        ROUTE_SELECTED: 'ROUTE_SELECTED',  // Route chosen, Start Trip available
        NAVIGATING:     'NAVIGATING',      // Active turn-by-turn navigation
        PAUSED:         'PAUSED',          // Navigation paused, state preserved
        FINISHED:       'FINISHED'         // Trip completed or stopped
    });

    let tripState = TripState.IDLE;

    // ── Navigation-specific state ──
    const ARRIVAL_RADIUS = 40;          // meters — triggers arrival detection
    const NAV_STEP_ADVANCE_RADIUS = 30; // meters — advance to next instruction
    let navWatchId = null;              // watchPosition ID for nav tracking
    let navStartTime = null;            // Date when trip started
    let navDistanceCovered = 0;         // meters traveled so far
    let navLastLatLng = null;           // last position for distance accumulation
    let navStepIndex = 0;               // current step in route instructions
    let navRoute = null;                // reference to selected route object
    let navHudEl = null;                // navigation HUD DOM element
    let navPreTilt = 0;                 // map tilt before navigation
    let navPreZoom = 13;                // map zoom before navigation
    let navPreCenter = null;            // map center before navigation

    /** Transition the state machine with logging */
    function setTripState(newState) {
        const prev = tripState;
        tripState = newState;
        console.log(`[EcoPath] State: ${prev} → ${newState}`);
        // Reflect state on <body> for CSS hooks
        document.body.dataset.tripState = newState.toLowerCase();
    }

    // ═══════════════════════════════════════════════════════════
    //  BACKEND SYNC STATE — Trip persistence via API
    // ═══════════════════════════════════════════════════════════
    let activeTripId = null;             // Server-assigned trip ID
    let syncIntervalId = null;           // setInterval ID for periodic updates
    const SYNC_INTERVAL_MS = 20000;      // 20 seconds between periodic syncs

    // ═══════════════════════════════════════════════════════════
    //  TRIP SERVICE — fetch()-based API layer
    //  All calls are fire-and-forget-safe; navigation continues
    //  even if the backend is unreachable.
    // ═══════════════════════════════════════════════════════════
    const TripService = {
        /** Read the CSRF token from the hidden input rendered by @Html.AntiForgeryToken() */
        _getToken() {
            const el = document.querySelector('input[name="__RequestVerificationToken"]');
            return el ? el.value : '';
        },

        /** Common fetch wrapper — JSON body + CSRF header */
        async _post(url, body) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'RequestVerificationToken': this._getToken()
                    },
                    body: JSON.stringify(body)
                });
                if (!res.ok) {
                    console.warn(`[TripService] ${url} → ${res.status}`);
                    return null;
                }
                return await res.json();
            } catch (err) {
                console.warn(`[TripService] ${url} failed:`, err.message);
                return null; // graceful degradation — nav continues offline
            }
        },

        /**
         * POST /Trip/ApiStart — create trip record, returns { tripId, status, startTime }
         */
        async start(payload) {
            return this._post('/Trip/ApiStart', payload);
        },

        /**
         * POST /Trip/ApiUpdate — periodic sync during navigation
         */
        async update(payload) {
            return this._post('/Trip/ApiUpdate', payload);
        },

        /**
         * POST /Trip/ApiFinish — mark trip as completed, returns summary data
         */
        async finish(payload) {
            return this._post('/Trip/ApiFinish', payload);
        },

        /**
         * POST /Trip/ApiCancel — mark trip as canceled, returns partial summary
         */
        async cancel(payload) {
            return this._post('/Trip/ApiCancel', payload);
        }
    };

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
            // Block destination changes during active navigation
            if (tripState === TripState.NAVIGATING || tripState === TripState.PAUSED) return;

            const latLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
            const destInput = document.getElementById('dest-input');

            setDestination(latLng);
            reverseGeocode(latLng, destInput);
        });
    }

    /** Set destination, place marker, and auto-calculate route */
    function setDestination(latLng, label = null) {
        // Block destination changes during active navigation
        if (tripState === TripState.NAVIGATING || tripState === TripState.PAUSED) return;

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
                // Block mode changes during active navigation
                if (tripState === TripState.NAVIGATING || tripState === TripState.PAUSED) return;

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
        // Don't recalculate during active navigation
        if (tripState === TripState.NAVIGATING || tripState === TripState.PAUSED) return;

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
        selectedRouteIndex = -1;
        hasUserSelectedRoute = false;

        const routesToShow = result.routes.slice(0, 3);
        const palette = MODE_COLORS[mode] || MODE_COLORS.DRIVING;

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

            // First route is thicker to hint "recommended", but NOT selected yet
            const isMain = index === 0;
            const routeShade = palette.shades[Math.min(index, palette.shades.length - 1)];

            // Create DirectionsRenderer for this route
            const renderer = new google.maps.DirectionsRenderer({
                map,
                directions: result,
                routeIndex: index,
                suppressMarkers: true,
                polylineOptions: {
                    strokeColor: routeShade,
                    strokeWeight: isMain ? 6 : 4,
                    strokeOpacity: isMain ? 0.85 : 0.5,
                    zIndex: isMain ? 5 : 1
                }
            });

            // Build route card
            const card = document.createElement('div');
            card.className = 'eco-route-card';
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');

            const emissionClass = emissions === 0
                ? 'eco-badge--green'
                : (index === 0 ? 'eco-badge--blue' : 'eco-badge--gray');
            const modeIcon = getModeIcon(mode);

            // Color dot to visually match the polyline shade
            card.innerHTML = `
                <div class="eco-route-card__header">
                    <div class="eco-route-card__title">
                        <span class="eco-route-dot" style="background:${routeShade}"></span>
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

            // Store route data
            currentRoutesData.push({
                index,
                renderer,
                card,
                shade: routeShade,
                palette,
                directions: result,
                mode
            });

            // Interactive events
            card.addEventListener('click', () => selectRoute(index));
            card.addEventListener('mouseenter', () => hoverRoute(index, true));
            card.addEventListener('mouseleave', () => hoverRoute(index, false));
        });

        // ── Inject Start Trip button after route cards ──
        renderStartTripButton(container);
    }

    function selectRoute(clickedIndex) {
        // Block route changes during active navigation
        if (tripState === TripState.NAVIGATING || tripState === TripState.PAUSED) return;

        selectedRouteIndex = clickedIndex;
        hasUserSelectedRoute = true;
        setTripState(TripState.ROUTE_SELECTED);

        // Enable the Start Trip button now that a route is selected
        const startBtn = document.getElementById('start-trip-btn');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.classList.add('eco-start-btn--ready');
        }

        // Recreate each renderer with updated polyline styles.
        // Selected route → base color, thick, high opacity, high z-index.
        // Others → their shade, thinner, lower opacity.
        currentRoutesData.forEach(data => {
            const isSelected = data.index === clickedIndex;

            data.renderer.setMap(null);

            data.renderer = new google.maps.DirectionsRenderer({
                map,
                directions: data.directions,
                routeIndex: data.index,
                suppressMarkers: true,
                polylineOptions: {
                    strokeColor: isSelected ? data.palette.base : data.shade,
                    strokeWeight: isSelected ? 7 : 4,
                    strokeOpacity: isSelected ? 0.95 : 0.45,
                    zIndex: isSelected ? 10 : 1
                }
            });

            data.card.classList.toggle('eco-route-card--active', isSelected);
            // Dynamic border color matching the mode palette
            if (isSelected) {
                data.card.style.setProperty('--active-route-color', data.palette.base);
            } else {
                data.card.style.removeProperty('--active-route-color');
            }
        });
    }

    function hoverRoute(hoveredIndex, isHovering) {
        if (hoveredIndex === selectedRouteIndex) return;

        const data = currentRoutesData[hoveredIndex];

        data.renderer.setMap(null);
        data.renderer = new google.maps.DirectionsRenderer({
            map,
            directions: data.directions,
            routeIndex: data.index,
            suppressMarkers: true,
            polylineOptions: {
                strokeColor: isHovering ? data.palette.base : data.shade,
                strokeWeight: isHovering ? 5 : 4,
                strokeOpacity: isHovering ? 0.7 : 0.45,
                zIndex: isHovering ? 5 : 1
            }
        });

        data.card.classList.toggle('eco-route-card--hover', isHovering);
    }

    // ═══════════════════════════════════════════════════════════
    //  8b. START TRIP BUTTON — appears after routes, disabled
    //      until the user explicitly selects a route
    // ═══════════════════════════════════════════════════════════

    function renderStartTripButton(container) {
        // Remove previous button if present
        const prev = document.getElementById('start-trip-btn');
        if (prev) prev.remove();

        const btn = document.createElement('button');
        btn.id = 'start-trip-btn';
        btn.className = 'eco-start-btn';
        btn.disabled = true;
        btn.innerHTML = `<i class="bi bi-play-fill"></i> Start Trip`;

        btn.addEventListener('click', () => {
            if (!hasUserSelectedRoute || selectedRouteIndex < 0) return;
            if (tripState !== TripState.ROUTE_SELECTED) return;

            // Transition to NAVIGATING → launches turn-by-turn navigation
            startTrip();
        });

        container.appendChild(btn);
    }

    /** Clear all rendered routes from map */
    function clearRoutes() {
        currentRoutesData.forEach(data => data.renderer.setMap(null));
        currentRoutesData = [];
        selectedRouteIndex = -1;
        hasUserSelectedRoute = false;

        // Remove Start Trip button
        const startBtn = document.getElementById('start-trip-btn');
        if (startBtn) startBtn.remove();

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
    //  TRIP MANAGER — Navigation lifecycle & state transitions
    // ═══════════════════════════════════════════════════════════

    /**
     * START TRIP
     * Transition: ROUTE_SELECTED → NAVIGATING
     * - Lock route/destination selection (guards in selectRoute, setDestination)
     * - Hide alternative routes, keep only selected
     * - Enter navigation camera mode (zoom 18, tilt, follow user)
     * - Start dedicated navigation watchPosition
     * - Show floating navigation HUD
     */
    function startTrip() {
        if (tripState !== TripState.ROUTE_SELECTED) return;
        if (selectedRouteIndex < 0 || !currentRoutesData[selectedRouteIndex]) return;

        setTripState(TripState.NAVIGATING);

        const selected = currentRoutesData[selectedRouteIndex];
        navRoute = selected.directions.routes[selected.index];
        navStepIndex = 0;
        navDistanceCovered = 0;
        navLastLatLng = userLatLng ? { ...userLatLng } : null;
        navStartTime = new Date();

        // ── Hide alternative routes, keep only the selected one ──
        currentRoutesData.forEach(data => {
            if (data.index !== selectedRouteIndex) {
                data.renderer.setMap(null);
                data.card.style.display = 'none';
            }
        });

        // ── Save current map state for restoration after trip ──
        navPreZoom = map.getZoom();
        navPreCenter = map.getCenter();
        navPreTilt = (typeof map.getTilt === 'function') ? (map.getTilt() || 0) : 0;

        // ── Enter navigation camera ──
        enterNavCamera();

        // ── Switch UI: hide planner panel, show nav HUD ──
        togglePanel(false);
        renderNavHud();

        // ── Stop general live tracking, start navigation-specific tracking ──
        stopLiveTracking();
        startNavTracking();

        // ── Backend: create trip record + start periodic sync ──
        const destPos = destinationMarker ? destinationMarker.getPosition() : null;
        TripService.start({
            transportMode: selected.mode || 'DRIVING',
            startLocation: document.getElementById('start-input')?.value || '',
            endLocation: document.getElementById('dest-input')?.value || '',
            startLatitude: userLatLng?.lat || 0,
            startLongitude: userLatLng?.lng || 0,
            endLatitude: destPos ? destPos.lat() : 0,
            endLongitude: destPos ? destPos.lng() : 0,
            totalRouteDistance: navRoute.legs[0].distance.value,
            routeSummary: navRoute.summary || ''
        }).then(res => {
            if (res && res.tripId) {
                activeTripId = res.tripId;
                console.log('[TripService] Trip created, id:', activeTripId);
            }
        });
        startPeriodicSync();

        console.log('[EcoPath] Trip started', {
            route: navRoute.summary,
            steps: navRoute.legs[0].steps.length,
            distance: navRoute.legs[0].distance.text,
            duration: navRoute.legs[0].duration.text
        });
    }

    /**
     * PAUSE TRIP
     * Transition: NAVIGATING → PAUSED
     * - Stop GPS tracking (saves battery)
     * - Keep all state intact (distance, step index, etc.)
     * - Update HUD to show paused state with Resume button
     */
    function pauseTrip() {
        if (tripState !== TripState.NAVIGATING) return;

        setTripState(TripState.PAUSED);
        stopNavTracking();
        stopPeriodicSync();
        updateNavHudPaused(true);
        showLocationStatus('Navigare în pauză', 'info');

        // Sync paused state to backend
        syncTripUpdate(true);
    }

    /**
     * RESUME TRIP
     * Transition: PAUSED → NAVIGATING
     * - Restart GPS tracking from current position
     * - Re-enter navigation camera
     */
    function resumeTrip() {
        if (tripState !== TripState.PAUSED) return;

        setTripState(TripState.NAVIGATING);
        startNavTracking();
        enterNavCamera();
        startPeriodicSync();
        updateNavHudPaused(false);
        showLocationStatus('Navigare reluată', 'success');

        // Sync resumed state to backend
        syncTripUpdate(false);
    }

    /**
     * STOP TRIP (user-initiated abort)
     * Transition: NAVIGATING | PAUSED → FINISHED
     * - End tracking immediately
     * - Save distance covered to localStorage
     * - Restore normal map view
     */
    function stopTrip() {
        if (tripState !== TripState.NAVIGATING && tripState !== TripState.PAUSED) return;

        setTripState(TripState.FINISHED);
        stopNavTracking();
        stopPeriodicSync();

        // Save partial trip to localStorage
        saveTripLocally(false);

        // Cancel trip on backend → show summary modal with server response
        const payload = buildTripPayload();
        TripService.cancel(payload).then(res => {
            showTripSummaryModal(res, false);
        });

        showLocationStatus(
            `Trip oprit — ${(navDistanceCovered / 1000).toFixed(2)} km parcurși`,
            'info'
        );

        // Restore normal map mode
        exitNavigationMode();
    }

    /**
     * FINISH TRIP (arrival at destination)
     * Transition: NAVIGATING → FINISHED
     * - End tracking
     * - Save complete trip data to localStorage
     * - Show success feedback
     */
    function finishTrip() {
        if (tripState !== TripState.NAVIGATING) return;

        setTripState(TripState.FINISHED);
        stopNavTracking();
        stopPeriodicSync();

        // Save completed trip to localStorage
        saveTripLocally(true);

        // Finish trip on backend → show summary modal with server response
        const payload = buildTripPayload();
        TripService.finish(payload).then(res => {
            showTripSummaryModal(res, true);
        });

        const distKm = (navDistanceCovered / 1000).toFixed(2);
        const elapsed = formatDuration(
            Math.round((Date.now() - navStartTime.getTime()) / 1000)
        );
        showLocationStatus(`Ai ajuns! ${distKm} km în ${elapsed}`, 'success');

        // Restore normal map mode
        exitNavigationMode();
    }

    // ─── Navigation Camera ────────────────────────────────────

    /**
     * Enter Waze-like navigation camera:
     * - Zoom 18 (street-level)
     * - Tilt 45° for perspective (requires WebGL Vector Map / Map ID;
     *   silently ignored on classic raster maps)
     * - Center on user with downward offset so user appears
     *   in the lower third — more road visible ahead
     */
    function enterNavCamera() {
        map.setZoom(18);

        // Tilt and heading only work with vector maps (WebGL / Map ID).
        // On classic raster maps these calls are silently ignored.
        if (typeof map.setTilt === 'function') map.setTilt(45);

        if (userLatLng) {
            centerOnUserNav(userLatLng);
        }
    }

    /**
     * Center map so user appears in the lower ~1/3 of the viewport.
     * At zoom 18, 1° latitude ≈ 111,320m. We offset ~150m north
     * so the view shows more road ahead.
     */
    function centerOnUserNav(latLng) {
        const offsetDeg = 150 / 111320;
        map.panTo({ lat: latLng.lat + offsetDeg, lng: latLng.lng });
    }

    /**
     * Compute bearing from point A to B (degrees 0-360).
     * Used to set map heading so the map faces the travel direction.
     */
    function computeBearing(from, to) {
        const dLng = (to.lng - from.lng) * Math.PI / 180;
        const lat1 = from.lat * Math.PI / 180;
        const lat2 = to.lat * Math.PI / 180;
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
    }

    // ─── Navigation GPS Tracking ──────────────────────────────

    /** Stop the general-purpose live tracking watcher */
    function stopLiveTracking() {
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
    }

    /**
     * Start a dedicated watchPosition for navigation.
     * Higher frequency, zero maximumAge for best GPS accuracy.
     *
     * On each position update:
     *   1. Animate user marker smoothly
     *   2. Accumulate distance covered (ignore GPS jumps > 200m)
     *   3. Center map on user (with navigation offset)
     *   4. Advance step if user passed current step endpoint
     *   5. Rotate map heading toward next waypoint (vector maps)
     *   6. Check arrival at destination (40m radius)
     *   7. Update navigation HUD
     */
    function startNavTracking() {
        if (navWatchId !== null) return; // already tracking

        navWatchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                const newLatLng = { lat: latitude, lng: longitude };

                // Skip tiny movements to reduce jitter
                if (userLatLng && getDistanceMeters(userLatLng, newLatLng) < 2) return;

                const oldLatLng = userLatLng;
                userLatLng = newLatLng;

                // 1. Smooth marker animation
                animateMarkerTo(userMarker, oldLatLng, newLatLng);
                if (userAccuracyCircle) {
                    userAccuracyCircle.setCenter(newLatLng);
                    userAccuracyCircle.setRadius(accuracy);
                }

                // 2. Accumulate distance (ignore teleportation glitches)
                if (navLastLatLng) {
                    const delta = getDistanceMeters(navLastLatLng, newLatLng);
                    if (delta < 200) {
                        navDistanceCovered += delta;
                    }
                }
                navLastLatLng = { ...newLatLng };

                // 3. Center map with navigation offset
                centerOnUserNav(newLatLng);

                // 4. Advance step if near current step endpoint
                advanceNavStep(newLatLng);

                // 5. Set map heading toward next waypoint (vector maps only)
                setNavHeading(newLatLng);

                // 6. Check arrival at destination
                checkArrival(newLatLng);

                // 7. Update HUD
                updateNavHud();
            },
            (error) => {
                console.warn('[EcoPath] Nav tracking error:', error.message);
            },
            {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 0  // Always fresh position for navigation
            }
        );
    }

    /** Stop navigation-specific GPS tracking */
    function stopNavTracking() {
        if (navWatchId !== null) {
            navigator.geolocation.clearWatch(navWatchId);
            navWatchId = null;
        }
    }

    // ─── Step Advancement ─────────────────────────────────────

    /**
     * Check if user has reached the end of the current step.
     * If within NAV_STEP_ADVANCE_RADIUS (30m) of the step endpoint,
     * advance navStepIndex to show the next instruction.
     */
    function advanceNavStep(latLng) {
        if (!navRoute) return;
        const steps = navRoute.legs[0].steps;
        if (navStepIndex >= steps.length) return;

        const stepEnd = steps[navStepIndex].end_location;
        const dist = getDistanceMeters(latLng, {
            lat: stepEnd.lat(),
            lng: stepEnd.lng()
        });

        if (dist < NAV_STEP_ADVANCE_RADIUS && navStepIndex < steps.length - 1) {
            navStepIndex++;
        }
    }

    /**
     * Rotate map to face direction of travel.
     * Uses the current step's end_location as the look-ahead target.
     * Only effective on WebGL vector maps with Map ID.
     */
    function setNavHeading(latLng) {
        if (!navRoute || typeof map.setHeading !== 'function') return;
        const steps = navRoute.legs[0].steps;
        if (navStepIndex >= steps.length) return;

        const target = steps[navStepIndex].end_location;
        const bearing = computeBearing(latLng, {
            lat: target.lat(),
            lng: target.lng()
        });
        map.setHeading(bearing);
    }

    // ─── Arrival Detection ────────────────────────────────────

    /**
     * Check if user is within ARRIVAL_RADIUS (40m) of the destination.
     *
     * Design choice: show a "Finish Trip" button rather than auto-finishing.
     * Auto-finish risks premature triggering from GPS bounce near the
     * destination. A confirmation button gives the user explicit control
     * while still appearing automatically when arrival is detected.
     */
    function checkArrival(latLng) {
        if (!destinationMarker) return;
        const destPos = destinationMarker.getPosition();
        const dist = getDistanceMeters(latLng, {
            lat: destPos.lat(),
            lng: destPos.lng()
        });

        if (dist <= ARRIVAL_RADIUS) {
            showArrivalPrompt();
        }
    }

    /** Show "Finish Trip" button inside the nav HUD */
    function showArrivalPrompt() {
        if (!navHudEl) return;
        // Only inject once
        if (navHudEl.querySelector('.nav-btn--finish')) return;

        const actionsBar = navHudEl.querySelector('.nav-hud__actions');
        if (!actionsBar) return;

        // Replace pause/stop with a single prominent Finish button
        actionsBar.innerHTML = `
            <button class="nav-btn nav-btn--finish" onclick="EcoMap.finishTrip()">
                <i class="bi bi-flag-fill"></i> Finish Trip — Ai ajuns!
            </button>
        `;
        showLocationStatus('Ești aproape de destinație!', 'success');
    }

    // ─── Navigation HUD ──────────────────────────────────────

    /**
     * Render the floating navigation HUD overlay.
     * Dynamically created and appended to #map-container.
     * Shows: current instruction, remaining distance, ETA,
     * distance covered, and Pause / Stop action buttons.
     */
    function renderNavHud() {
        removeNavHud();

        const hud = document.createElement('div');
        hud.id = 'nav-hud';
        hud.className = 'nav-hud';

        const step = navRoute?.legs[0]?.steps[navStepIndex];
        const instruction = step ? stripHtml(step.instructions) : 'Începe navigarea...';
        const remaining = getRemainingDistanceText();
        const eta = getEtaText();

        hud.innerHTML = `
            <div class="nav-hud__instruction">
                <i class="bi bi-navigation-fill"></i>
                <span id="nav-instruction-text">${instruction}</span>
            </div>
            <div class="nav-hud__stats">
                <div class="nav-hud__stat">
                    <span class="nav-hud__value" id="nav-remaining">${remaining}</span>
                    <span class="nav-hud__label">Rămas</span>
                </div>
                <div class="nav-hud__stat">
                    <span class="nav-hud__value" id="nav-eta">${eta}</span>
                    <span class="nav-hud__label">ETA</span>
                </div>
                <div class="nav-hud__stat">
                    <span class="nav-hud__value" id="nav-covered">${(navDistanceCovered / 1000).toFixed(1)} km</span>
                    <span class="nav-hud__label">Parcurs</span>
                </div>
            </div>
            <div class="nav-hud__actions">
                <button class="nav-btn nav-btn--pause" id="nav-pause-btn" onclick="EcoMap.pauseTrip()">
                    <i class="bi bi-pause-fill"></i> Pauză
                </button>
                <button class="nav-btn nav-btn--stop" onclick="EcoMap.stopTrip()">
                    <i class="bi bi-stop-fill"></i> Stop
                </button>
            </div>
        `;

        document.getElementById('map-container').appendChild(hud);
        navHudEl = hud;
    }

    /** Update HUD values on each location tick */
    function updateNavHud() {
        if (!navHudEl || !navRoute) return;

        const step = navRoute.legs[0].steps[navStepIndex];

        // Current instruction
        const instrEl = navHudEl.querySelector('#nav-instruction-text');
        if (instrEl && step) {
            instrEl.textContent = stripHtml(step.instructions);
        }

        // Remaining distance
        const remEl = navHudEl.querySelector('#nav-remaining');
        if (remEl) remEl.textContent = getRemainingDistanceText();

        // ETA
        const etaEl = navHudEl.querySelector('#nav-eta');
        if (etaEl) etaEl.textContent = getEtaText();

        // Distance covered
        const covEl = navHudEl.querySelector('#nav-covered');
        if (covEl) covEl.textContent = `${(navDistanceCovered / 1000).toFixed(1)} km`;
    }

    /** Toggle HUD pause/resume button appearance */
    function updateNavHudPaused(isPaused) {
        if (!navHudEl) return;
        navHudEl.classList.toggle('nav-hud--paused', isPaused);

        const pauseBtn = navHudEl.querySelector('#nav-pause-btn');
        if (pauseBtn) {
            if (isPaused) {
                pauseBtn.innerHTML = `<i class="bi bi-play-fill"></i> Reia`;
                pauseBtn.setAttribute('onclick', 'EcoMap.resumeTrip()');
            } else {
                pauseBtn.innerHTML = `<i class="bi bi-pause-fill"></i> Pauză`;
                pauseBtn.setAttribute('onclick', 'EcoMap.pauseTrip()');
            }
        }
    }

    /** Remove nav HUD from DOM */
    function removeNavHud() {
        const el = document.getElementById('nav-hud');
        if (el) el.remove();
        navHudEl = null;
    }

    // ─── Navigation Helpers ──────────────────────────────────

    /**
     * Calculate remaining route distance by summing step distances
     * from the current step index onward (route-aware, not straight-line).
     */
    function getRemainingDistanceText() {
        if (!navRoute) return '—';
        const steps = navRoute.legs[0].steps;
        let remaining = 0;
        for (let i = navStepIndex; i < steps.length; i++) {
            remaining += steps[i].distance.value;
        }
        return remaining >= 1000
            ? `${(remaining / 1000).toFixed(1)} km`
            : `${Math.round(remaining)} m`;
    }

    /**
     * Calculate ETA by summing remaining step durations
     * and adding to the current time.
     */
    function getEtaText() {
        if (!navRoute) return '—';
        const steps = navRoute.legs[0].steps;
        let remainingSecs = 0;
        for (let i = navStepIndex; i < steps.length; i++) {
            remainingSecs += steps[i].duration.value;
        }
        const eta = new Date(Date.now() + remainingSecs * 1000);
        return eta.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    }

    /** Strip HTML tags from Google Directions step instructions */
    function stripHtml(html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    /**
     * Save trip data to localStorage.
     * Stored as an array of trip records for future backend sync.
     */
    function saveTripLocally(completed) {
        const elapsed = navStartTime
            ? Math.round((Date.now() - navStartTime.getTime()) / 1000)
            : 0;

        const tripRecord = {
            id: Date.now(),
            date: new Date().toISOString(),
            completed,
            mode: currentRoutesData[selectedRouteIndex]?.mode || 'DRIVING',
            routeSummary: navRoute?.summary || '',
            distanceCovered: Math.round(navDistanceCovered),           // meters
            totalRouteDistance: navRoute?.legs[0]?.distance?.value || 0, // meters
            elapsedSeconds: elapsed,
            origin: userLatLng ? { ...userLatLng } : null,
            destination: destinationMarker
                ? {
                    lat: destinationMarker.getPosition().lat(),
                    lng: destinationMarker.getPosition().lng()
                }
                : null
        };

        const trips = JSON.parse(localStorage.getItem('ecopath_trips') || '[]');
        trips.push(tripRecord);
        localStorage.setItem('ecopath_trips', JSON.stringify(trips));

        console.log('[EcoPath] Trip saved locally', tripRecord);
    }

    // ─── Backend Sync Helpers ─────────────────────────────────

    /**
     * Build the common payload for update/finish/cancel API calls.
     * Calculates elapsed time and average speed from nav state.
     */
    function buildTripPayload() {
        const elapsed = navStartTime
            ? Math.round((Date.now() - navStartTime.getTime()) / 1000)
            : 0;
        const avgSpeed = elapsed > 0
            ? (navDistanceCovered / elapsed) * 3.6  // m/s → km/h
            : 0;

        return {
            tripId: activeTripId,
            distanceCovered: Math.round(navDistanceCovered),
            duration: elapsed,
            averageSpeed: Math.round(avgSpeed * 10) / 10
        };
    }

    /**
     * Send a periodic status update to the backend.
     * Called by the sync interval and on pause/resume events.
     */
    function syncTripUpdate(isPaused = false) {
        if (!activeTripId) return;
        const payload = { ...buildTripPayload(), isPaused };
        TripService.update(payload).then(res => {
            if (res) console.log('[TripService] Sync OK', res);
        });
    }

    /** Start the periodic 20-second sync interval */
    function startPeriodicSync() {
        stopPeriodicSync();
        syncIntervalId = setInterval(() => {
            if (tripState === TripState.NAVIGATING) {
                syncTripUpdate(false);
            }
        }, SYNC_INTERVAL_MS);
    }

    /** Stop the periodic sync interval */
    function stopPeriodicSync() {
        if (syncIntervalId !== null) {
            clearInterval(syncIntervalId);
            syncIntervalId = null;
        }
    }

    // ─── Trip Summary Modal ──────────────────────────────────

    /**
     * Display a modal summarizing the completed or canceled trip.
     * Uses server response data if available, falls back to local nav state.
     *
     * @param {object|null} serverData — response from TripService.finish/cancel
     * @param {boolean} completed — true = arrived, false = stopped early
     */
    function showTripSummaryModal(serverData, completed) {
        // Remove any existing modal
        const prev = document.getElementById('trip-summary-modal');
        if (prev) prev.remove();

        const elapsed = navStartTime
            ? Math.round((Date.now() - navStartTime.getTime()) / 1000)
            : 0;
        const totalRoute = navRoute?.legs[0]?.distance?.value || 0;

        // Prefer server data, fall back to local calculations
        const distKm      = serverData?.distance ?? (navDistanceCovered / 1000);
        const duration     = serverData?.duration ?? elapsed;
        const co2Saved     = serverData?.co2Saved ?? 0;
        const calories     = serverData?.caloriesBurned ?? 0;
        const avgSpeed     = serverData?.averageSpeed ?? (elapsed > 0 ? (navDistanceCovered / elapsed) * 3.6 : 0);
        const completion   = serverData?.completionPercent ?? (totalRoute > 0 ? Math.min(100, (navDistanceCovered / totalRoute) * 100) : 0);

        const mode = currentRoutesData[selectedRouteIndex]?.mode || 'DRIVING';
        const palette = MODE_COLORS[mode] || MODE_COLORS.DRIVING;
        const modeIcon = getModeIcon(mode);
        const modeLabel = { DRIVING: 'Mașină', WALKING: 'Pe jos', BICYCLING: 'Bicicletă', TRANSIT: 'Transport public' }[mode] || mode;

        const statusIcon = completed ? 'bi-flag-fill' : 'bi-exclamation-triangle-fill';
        const statusText = completed ? 'Trip finalizat!' : 'Trip oprit';
        const statusClass = completed ? 'trip-summary--completed' : 'trip-summary--canceled';

        const modal = document.createElement('div');
        modal.id = 'trip-summary-modal';
        modal.className = 'trip-summary-overlay';
        modal.innerHTML = `
            <div class="trip-summary ${statusClass}">
                <div class="trip-summary__header" style="--summary-color: ${palette.base}">
                    <i class="bi ${statusIcon}"></i>
                    <h3>${statusText}</h3>
                    ${!completed ? `<span class="trip-summary__completion">${completion.toFixed(1)}% completat</span>` : ''}
                </div>
                <div class="trip-summary__mode">
                    <i class="bi ${modeIcon}"></i> ${modeLabel}
                    ${navRoute?.summary ? `<span class="trip-summary__route">— ${navRoute.summary}</span>` : ''}
                </div>
                <div class="trip-summary__grid">
                    <div class="trip-summary__stat">
                        <span class="trip-summary__value">${distKm.toFixed(2)} km</span>
                        <span class="trip-summary__label">Distanță parcursă</span>
                    </div>
                    <div class="trip-summary__stat">
                        <span class="trip-summary__value">${formatDuration(duration)}</span>
                        <span class="trip-summary__label">Durată</span>
                    </div>
                    <div class="trip-summary__stat">
                        <span class="trip-summary__value">${avgSpeed.toFixed(1)} km/h</span>
                        <span class="trip-summary__label">Viteză medie</span>
                    </div>
                    <div class="trip-summary__stat">
                        <span class="trip-summary__value">${co2Saved.toFixed(2)} kg</span>
                        <span class="trip-summary__label">CO₂ economisit</span>
                    </div>
                    ${calories > 0 ? `
                    <div class="trip-summary__stat">
                        <span class="trip-summary__value">${Math.round(calories)} kcal</span>
                        <span class="trip-summary__label">Calorii arse</span>
                    </div>` : ''}
                    ${!completed ? `
                    <div class="trip-summary__stat">
                        <span class="trip-summary__value">${completion.toFixed(1)}%</span>
                        <span class="trip-summary__label">Progres rută</span>
                    </div>` : ''}
                </div>
                <button class="trip-summary__close" id="close-trip-summary">
                    <i class="bi bi-check-lg"></i> Închide
                </button>
            </div>
        `;

        document.getElementById('map-container').appendChild(modal);

        // Animate in
        requestAnimationFrame(() => modal.classList.add('trip-summary-overlay--visible'));

        // Close handler
        document.getElementById('close-trip-summary').addEventListener('click', () => {
            modal.classList.remove('trip-summary-overlay--visible');
            setTimeout(() => modal.remove(), 300);
        });

        // Also close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('trip-summary-overlay--visible');
                setTimeout(() => modal.remove(), 300);
            }
        });
    }

    /**
     * Restore normal map mode after navigation ends.
     * - Remove nav HUD
     * - Restore zoom / tilt / heading
     * - Show side panel
     * - Re-show all route alternatives
     * - Restart general live tracking
     * - Reset trip state to IDLE
     */
    function exitNavigationMode() {
        removeNavHud();

        // Restore map camera
        map.setZoom(navPreZoom || 14);
        if (typeof map.setTilt === 'function') map.setTilt(navPreTilt || 0);
        if (typeof map.setHeading === 'function') map.setHeading(0);
        if (navPreCenter) map.setCenter(navPreCenter);

        // Re-show all routes and cards
        currentRoutesData.forEach(data => {
            data.renderer.setMap(map);
            data.card.style.display = '';
            data.card.classList.remove('eco-route-card--active');
        });

        // Show planner panel again
        togglePanel(true);

        // Reset navigation state
        navRoute = null;
        navStepIndex = 0;
        navDistanceCovered = 0;
        navLastLatLng = null;
        navStartTime = null;

        // Reset backend sync state
        activeTripId = null;
        stopPeriodicSync();

        // Restart general tracking
        startLiveTracking();

        // Back to IDLE (user can pick a new route)
        setTripState(TripState.IDLE);
        hasUserSelectedRoute = false;
        selectedRouteIndex = -1;

        // Reset Start Trip button
        const startBtn = document.getElementById('start-trip-btn');
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.classList.remove('eco-start-btn--ready', 'eco-start-btn--started');
            startBtn.innerHTML = `<i class="bi bi-play-fill"></i> Start Trip`;
        }
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
        togglePanel,
        pauseTrip,
        resumeTrip,
        stopTrip,
        finishTrip
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