"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const axios_1 = __importDefault(require("axios"));
const sqlite3_1 = __importDefault(require("sqlite3"));
const util_1 = require("util");
// Import polyline with type declaration
const polyline = require('@mapbox/polyline');
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Initialize SQLite database
const db = new sqlite3_1.default.Database(':memory:'); // In-memory database for demo
const dbRun = (0, util_1.promisify)(db.run.bind(db));
const dbGet = (0, util_1.promisify)(db.get.bind(db));
const dbAll = (0, util_1.promisify)(db.all.bind(db));
// Initialize database tables
async function initDatabase() {
    try {
        // Drivers table
        await dbRun(`
      CREATE TABLE IF NOT EXISTS drivers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        status TEXT DEFAULT 'available',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Deliveries table
        await dbRun(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        driver_id TEXT,
        pickup_latitude REAL NOT NULL,
        pickup_longitude REAL NOT NULL,
        delivery_latitude REAL NOT NULL,
        delivery_longitude REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        estimated_duration INTEGER,
        actual_duration INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (driver_id) REFERENCES drivers (id)
      )
    `);
        // Weather events table
        await dbRun(`
      CREATE TABLE IF NOT EXISTS weather_events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        radius REAL NOT NULL,
        active BOOLEAN DEFAULT true,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Routes table (for caching optimized routes)
        await dbRun(`
      CREATE TABLE IF NOT EXISTS routes (
        id TEXT PRIMARY KEY,
        driver_id TEXT,
        waypoints TEXT, -- JSON string of coordinates
        total_distance REAL,
        total_duration REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (driver_id) REFERENCES drivers (id)
      )
    `);
        console.log('Database initialized successfully');
    }
    catch (error) {
        console.error('Database initialization error:', error);
    }
}
// GraphHopper API configuration
const GRAPHHOPPER_URL = 'http://localhost:9000';
// Helper function to calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
// Helper function to check if a point is within a weather event radius
function isPointInWeatherEvent(lat, lon, event) {
    const distance = calculateDistance(lat, lon, event.latitude, event.longitude);
    return distance <= event.radius;
}
// Helper function to generate avoid areas for GraphHopper
function generateAvoidAreas(weatherEvents) {
    const avoidAreas = [];
    for (const event of weatherEvents) {
        // Create a polygon around the weather event center
        const radius = event.radius / 111.32; // Convert km to approximate degrees
        const centerLat = event.latitude;
        const centerLon = event.longitude;
        // Create a square around the weather event (GraphHopper accepts polygon format)
        const polygon = [
            `${centerLat + radius},${centerLon - radius}`, // top-left
            `${centerLat + radius},${centerLon + radius}`, // top-right
            `${centerLat - radius},${centerLon + radius}`, // bottom-right
            `${centerLat - radius},${centerLon - radius}`, // bottom-left
            `${centerLat + radius},${centerLon - radius}` // close polygon
        ].join(' ');
        avoidAreas.push(polygon);
        console.log(`Created avoid area for ${event.type}: ${polygon}`);
    }
    return avoidAreas;
}
// Helper function to generate strategic waypoints around weather events
function generateSafeWaypoints(startPoint, endPoint, weatherEvents) {
    const waypoints = [startPoint];
    for (const event of weatherEvents) {
        const eventLat = event.latitude;
        const eventLon = event.longitude;
        const radius = event.radius / 111.32; // Convert km to degrees
        // Calculate if the direct line from start to end passes near the weather event
        const midLat = (startPoint[0] + endPoint[0]) / 2;
        const midLon = (startPoint[1] + endPoint[1]) / 2;
        const distanceToEvent = calculateDistance(midLat, midLon, eventLat, eventLon);
        if (distanceToEvent < event.radius * 2) { // If route might pass near the weather event
            console.log(`Route may pass near ${event.type} event, adding detour waypoints`);
            // Determine which side to detour (left or right of the weather event)
            const bearing = Math.atan2(endPoint[1] - startPoint[1], endPoint[0] - startPoint[0]);
            const perpBearing = bearing + Math.PI / 2; // 90 degrees perpendicular
            // Create waypoints that go around the weather event
            const detourDistance = radius * 2; // Go well around the event
            const waypoint1Lat = eventLat + Math.cos(perpBearing) * detourDistance;
            const waypoint1Lon = eventLon + Math.sin(perpBearing) * detourDistance;
            const waypoint2Lat = eventLat - Math.cos(perpBearing) * detourDistance;
            const waypoint2Lon = eventLon - Math.sin(perpBearing) * detourDistance;
            // Choose the waypoint that's closer to the general direction of travel
            const dist1 = calculateDistance(startPoint[0], startPoint[1], waypoint1Lat, waypoint1Lon) +
                calculateDistance(waypoint1Lat, waypoint1Lon, endPoint[0], endPoint[1]);
            const dist2 = calculateDistance(startPoint[0], startPoint[1], waypoint2Lat, waypoint2Lon) +
                calculateDistance(waypoint2Lat, waypoint2Lon, endPoint[0], endPoint[1]);
            if (dist1 < dist2) {
                waypoints.push([waypoint1Lat, waypoint1Lon]);
            }
            else {
                waypoints.push([waypoint2Lat, waypoint2Lon]);
            }
        }
    }
    waypoints.push(endPoint);
    return waypoints;
}
// Helper function to get multiple alternative routes and select the best one
async function getBestWeatherAwareRoute(points, optimize = false) {
    try {
        console.log('Getting weather-aware routes with active avoidance...');
        // Get active weather events first
        const weatherEvents = await dbAll('SELECT * FROM weather_events WHERE active = 1');
        if (weatherEvents.length === 0) {
            console.log('No active weather events, using standard routing');
            return await callGraphHopper('/route', {
                point: points.map(([lat, lng]) => `${lat},${lng}`),
                type: 'json',
                locale: 'en-US',
                key: '',
                elevation: 'false',
                profile: 'car',
                optimize: optimize ? 'true' : 'false',
                points_encoded: 'true',
                details: 'road_class',
                instructions: 'false',
                calc_points: 'true'
            });
        }
        const routeOptions = [];
        // Generate avoid areas for GraphHopper
        const avoidAreas = generateAvoidAreas(weatherEvents);
        // Strategy 1: Use avoid areas to exclude weather zones
        console.log('Trying route with avoid areas...');
        try {
            const avoidParams = {
                point: points.map(([lat, lng]) => `${lat},${lng}`),
                type: 'json',
                locale: 'en-US',
                key: '',
                elevation: 'false',
                profile: 'car',
                optimize: optimize ? 'true' : 'false',
                points_encoded: 'true',
                details: 'road_class',
                instructions: 'false',
                calc_points: 'true'
            };
            // Add avoid areas
            avoidAreas.forEach((area, index) => {
                avoidParams[`avoid_polygon`] = area;
            });
            const avoidRoute = await callGraphHopper('/route', avoidParams);
            const penalizedAvoid = await applyWeatherPenalties(avoidRoute, points);
            routeOptions.push({ ...penalizedAvoid, routeType: 'avoid_areas' });
            console.log('Avoid areas route penalty:', penalizedAvoid.paths?.[0]?.weather_penalties?.total_penalty || 0);
        }
        catch (e) {
            console.log('Avoid areas route failed:', e);
        }
        // Strategy 2: Use strategic waypoints to force routes around weather
        if (points.length === 2) { // Only for simple point-to-point routes
            console.log('Trying route with strategic waypoints...');
            try {
                const safeWaypoints = generateSafeWaypoints(points[0], points[1], weatherEvents);
                console.log(`Generated ${safeWaypoints.length} waypoints:`, safeWaypoints);
                const waypointRoute = await callGraphHopper('/route', {
                    point: safeWaypoints.map(([lat, lng]) => `${lat},${lng}`),
                    type: 'json',
                    locale: 'en-US',
                    key: '',
                    elevation: 'false',
                    profile: 'car',
                    optimize: 'false', // Don't optimize when we have strategic waypoints
                    points_encoded: 'true',
                    details: 'road_class',
                    instructions: 'false',
                    calc_points: 'true'
                });
                const penalizedWaypoint = await applyWeatherPenalties(waypointRoute, safeWaypoints);
                routeOptions.push({ ...penalizedWaypoint, routeType: 'safe_waypoints' });
                console.log('Safe waypoints route penalty:', penalizedWaypoint.paths?.[0]?.weather_penalties?.total_penalty || 0);
            }
            catch (e) {
                console.log('Safe waypoints route failed:', e);
            }
        }
        // Strategy 3: Try different weighting algorithms
        const weightings = ['fastest', 'shortest'];
        for (const weighting of weightings) {
            console.log(`Trying ${weighting} route...`);
            try {
                const weightedRoute = await callGraphHopper('/route', {
                    point: points.map(([lat, lng]) => `${lat},${lng}`),
                    type: 'json',
                    locale: 'en-US',
                    key: '',
                    elevation: 'false',
                    profile: 'car',
                    optimize: optimize ? 'true' : 'false',
                    points_encoded: 'true',
                    details: 'road_class',
                    instructions: 'false',
                    calc_points: 'true',
                    weighting: weighting
                });
                const penalizedWeighted = await applyWeatherPenalties(weightedRoute, points);
                routeOptions.push({ ...penalizedWeighted, routeType: weighting });
                console.log(`${weighting} route penalty:`, penalizedWeighted.paths?.[0]?.weather_penalties?.total_penalty || 0);
            }
            catch (e) {
                console.log(`${weighting} route failed`);
            }
        }
        // Strategy 4: Force alternative routes with different parameters
        try {
            console.log('Trying alternative route algorithm...');
            const alternativeRoute = await callGraphHopper('/route', {
                point: points.map(([lat, lng]) => `${lat},${lng}`),
                type: 'json',
                locale: 'en-US',
                key: '',
                elevation: 'false',
                profile: 'car',
                optimize: optimize ? 'true' : 'false',
                points_encoded: 'true',
                details: 'road_class',
                instructions: 'false',
                calc_points: 'true',
                algorithm: 'alternative_route',
                'alternative_route.max_paths': '5',
                'alternative_route.max_weight_factor': '3',
                'alternative_route.max_share_factor': '0.8'
            });
            // Process all alternative paths if available
            if (alternativeRoute.paths && alternativeRoute.paths.length > 0) {
                for (let i = 0; i < Math.min(alternativeRoute.paths.length, 3); i++) {
                    const singlePathRoute = {
                        paths: [alternativeRoute.paths[i]],
                        info: alternativeRoute.info
                    };
                    const penalizedAlt = await applyWeatherPenalties(singlePathRoute, points);
                    routeOptions.push({ ...penalizedAlt, routeType: `alternative_${i}` });
                    console.log(`Alternative route ${i} penalty:`, penalizedAlt.paths?.[0]?.weather_penalties?.total_penalty || 0);
                }
            }
        }
        catch (e) {
            console.log('Alternative routes failed');
        }
        if (routeOptions.length === 0) {
            console.log('All weather-aware strategies failed, falling back to default route');
            const fallbackRoute = await callGraphHopper('/route', {
                point: points.map(([lat, lng]) => `${lat},${lng}`),
                type: 'json',
                locale: 'en-US',
                key: '',
                elevation: 'false',
                profile: 'car',
                optimize: optimize ? 'true' : 'false',
                points_encoded: 'true'
            });
            return await applyWeatherPenalties(fallbackRoute, points);
        }
        // Select the route with the lowest penalty (or lowest time if no penalties)
        const bestRoute = routeOptions.reduce((best, current) => {
            const bestPenalty = best.paths?.[0]?.weather_penalties?.total_penalty || 0;
            const currentPenalty = current.paths?.[0]?.weather_penalties?.total_penalty || 0;
            console.log(`Comparing ${best.routeType} (penalty: ${bestPenalty}) vs ${current.routeType} (penalty: ${currentPenalty})`);
            // If both have no penalty, choose the faster one
            if (bestPenalty === 0 && currentPenalty === 0) {
                return (best.paths?.[0]?.time || Infinity) < (current.paths?.[0]?.time || Infinity) ? best : current;
            }
            // Otherwise, choose the one with lower penalty
            return bestPenalty <= currentPenalty ? best : current;
        });
        console.log(`SELECTED: ${bestRoute.routeType} route with penalty: ${bestRoute.paths?.[0]?.weather_penalties?.total_penalty || 0}`);
        return bestRoute;
    }
    catch (error) {
        console.error('Error getting weather-aware route:', error);
        throw error;
    }
}
// Helper function to apply weather-based route penalties
async function applyWeatherPenalties(routeData, inputPoints) {
    try {
        // Get active weather events
        const weatherEvents = await dbAll('SELECT * FROM weather_events WHERE active = 1');
        if (!weatherEvents.length || !routeData.paths?.[0]) {
            return routeData;
        }
        const path = routeData.paths[0];
        let totalPenalty = 0;
        let affectedPoints = 0;
        // First, extract all route coordinates to check against weather events
        let routeCoordinates = [];
        if (path.points) {
            if (path.points_encoded && typeof path.points === 'string') {
                try {
                    const decoded = polyline.decode(path.points);
                    routeCoordinates = decoded;
                }
                catch (decodeError) {
                    console.error('Polyline decode error in penalty calculation:', decodeError);
                    routeCoordinates = inputPoints; // Fallback to input points
                }
            }
            else if (path.points.coordinates) {
                routeCoordinates = path.points.coordinates.map(([lng, lat]) => [lat, lng]);
            }
            else if (Array.isArray(path.points)) {
                routeCoordinates = path.points;
            }
            else {
                routeCoordinates = inputPoints;
            }
        }
        else {
            routeCoordinates = inputPoints;
        }
        // If we have too few route points, create intermediate sampling points
        if (routeCoordinates.length < 10) {
            console.log(`Route has only ${routeCoordinates.length} points, creating intermediate sampling points...`);
            const sampledPoints = [];
            for (let i = 0; i < routeCoordinates.length - 1; i++) {
                const [lat1, lon1] = routeCoordinates[i];
                const [lat2, lon2] = routeCoordinates[i + 1];
                sampledPoints.push([lat1, lon1]);
                // Create 10 intermediate points between each pair
                for (let j = 1; j < 10; j++) {
                    const ratio = j / 10;
                    const intermediateLat = lat1 + (lat2 - lat1) * ratio;
                    const intermediateLon = lon1 + (lon2 - lon1) * ratio;
                    sampledPoints.push([intermediateLat, intermediateLon]);
                }
            }
            // Add the last point
            sampledPoints.push(routeCoordinates[routeCoordinates.length - 1]);
            routeCoordinates = sampledPoints;
            console.log(`Created ${routeCoordinates.length} sampled route points`);
        }
        console.log(`Checking ${routeCoordinates.length} route points against ${weatherEvents.length} weather events`);
        // Check every point along the route against all weather events
        for (const [lat, lon] of routeCoordinates) {
            for (const event of weatherEvents) {
                if (isPointInWeatherEvent(lat, lon, event)) {
                    affectedPoints++;
                    // Apply massive penalties based on event type for EACH affected point
                    switch (event.type.toLowerCase()) {
                        case 'storm':
                        case 'heavy_rain':
                        case 'hurricane':
                            totalPenalty += 100.0; // Massive penalty per affected route point
                            break;
                        case 'traffic':
                        case 'accident':
                        case 'construction':
                            totalPenalty += 50.0; // Very high penalty per affected route point
                            break;
                        case 'light_rain':
                        case 'fog':
                            totalPenalty += 20.0; // High penalty per affected route point
                            break;
                        default:
                            totalPenalty += 30.0; // High default penalty per affected route point
                    }
                }
            }
        }
        // Apply penalties to route metrics if any points are affected
        if (totalPenalty > 0 && affectedPoints > 0) {
            // Calculate severity - more affected points = exponentially worse
            const severityMultiplier = Math.min(1 + (affectedPoints * 0.5), 10); // Cap at 10x
            const finalPenalty = totalPenalty * severityMultiplier;
            // Apply exponential penalty scaling
            const penaltyMultiplier = 1 + (finalPenalty * 0.1);
            path.time = Math.round(path.time * penaltyMultiplier);
            path.distance = Math.round(path.distance * (1 + finalPenalty * 0.02)); // Smaller distance penalty
            // Add detailed weather penalty info to response
            path.weather_penalties = {
                total_penalty: finalPenalty,
                affected_points: affectedPoints,
                total_route_points: routeCoordinates.length,
                affected_percentage: ((affectedPoints / routeCoordinates.length) * 100).toFixed(1),
                penalty_multiplier: penaltyMultiplier,
                severity_multiplier: severityMultiplier
            };
            console.log(`MAJOR WEATHER PENALTIES APPLIED:`);
            console.log(`- Affected points: ${affectedPoints}/${routeCoordinates.length} (${path.weather_penalties.affected_percentage}%)`);
            console.log(`- Total penalty: ${finalPenalty}`);
            console.log(`- New duration: ${path.time}ms (${penaltyMultiplier.toFixed(2)}x)`);
            console.log(`- New distance: ${path.distance}m`);
        }
        return routeData;
    }
    catch (error) {
        console.error('Error applying weather penalties:', error);
        return routeData; // Return original data if penalty calculation fails
    }
}
// Helper function to call GraphHopper API with bidirectional routing
async function callGraphHopper(endpoint, params) {
    try {
        // AGGRESSIVE bidirectional routing parameters - ignore ALL restrictions
        const bidirectionalParams = {
            ...params,
            // Disable ALL optimizations that might respect one-way streets
            'ch.disable': 'true', // Disable contraction hierarchies
            'lm.disable': 'true', // Disable landmarks
            'block_area': 'false', // Don't block any areas
            // Force the most flexible routing algorithm
            'algorithm': 'dijkstra', // Use basic Dijkstra - ignores most restrictions
            // Use profile only (compatible with modern GraphHopper API)
            'profile': 'car',
            // Force all roads to be accessible
            'encoded_values': 'road_class,road_environment,max_speed'
        };
        // Handle multiple point parameters correctly
        const urlParams = new URLSearchParams();
        for (const [key, value] of Object.entries(bidirectionalParams)) {
            if (key === 'point' && Array.isArray(value)) {
                // Add each point as a separate parameter
                value.forEach((point) => {
                    urlParams.append('point', point);
                });
            }
            else if (value !== undefined) {
                urlParams.append(key, value);
            }
        }
        const url = `${GRAPHHOPPER_URL}${endpoint}?${urlParams.toString()}`;
        console.log('🛣️ GraphHopper bidirectional request:', url);
        const response = await axios_1.default.get(url);
        // Log successful response
        if (response.data.paths && response.data.paths.length > 0) {
            console.log('✅ Bidirectional route found:', response.data.paths.length, 'path(s)');
        }
        return response.data;
    }
    catch (error) {
        console.error('❌ GraphHopper API error:', error.response?.data || error.message);
        throw new Error(`GraphHopper API call failed: ${error.message}`);
    }
}
// Routes
// Get all drivers
app.get('/api/drivers', async (req, res) => {
    try {
        const drivers = await dbAll('SELECT * FROM drivers');
        res.json(drivers);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Add new driver
app.post('/api/drivers', async (req, res) => {
    try {
        const { id, name, latitude, longitude } = req.body;
        if (!id || !name || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        await dbRun('INSERT INTO drivers (id, name, latitude, longitude) VALUES (?, ?, ?, ?)', [id, name, latitude, longitude]);
        const driver = await dbGet('SELECT * FROM drivers WHERE id = ?', [id]);
        res.status(201).json(driver);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get all deliveries
app.get('/api/deliveries', async (req, res) => {
    try {
        const deliveries = await dbAll('SELECT * FROM deliveries');
        res.json(deliveries);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Add new delivery
app.post('/api/deliveries', async (req, res) => {
    try {
        const { id, driver_id, pickup_latitude, pickup_longitude, delivery_latitude, delivery_longitude } = req.body;
        if (!id || pickup_latitude === undefined || pickup_longitude === undefined ||
            delivery_latitude === undefined || delivery_longitude === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        await dbRun('INSERT INTO deliveries (id, driver_id, pickup_latitude, pickup_longitude, delivery_latitude, delivery_longitude) VALUES (?, ?, ?, ?, ?, ?)', [id, driver_id, pickup_latitude, pickup_longitude, delivery_latitude, delivery_longitude]);
        const delivery = await dbGet('SELECT * FROM deliveries WHERE id = ?', [id]);
        res.status(201).json(delivery);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get optimized route for driver
app.get('/api/drivers/:driverId/route', async (req, res) => {
    try {
        const { driverId } = req.params;
        // Get driver location
        const driver = await dbGet('SELECT * FROM drivers WHERE id = ?', [driverId]);
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }
        // Get pending deliveries for driver
        const deliveries = await dbAll('SELECT * FROM deliveries WHERE driver_id = ? AND status = ?', [driverId, 'pending']);
        if (deliveries.length === 0) {
            return res.json({ route: [], distance: 0, duration: 0 });
        }
        // Build points for GraphHopper (driver location + all pickup/delivery points)
        const points = [[driver.latitude, driver.longitude]];
        deliveries.forEach(delivery => {
            points.push([delivery.pickup_latitude, delivery.pickup_longitude]);
            points.push([delivery.delivery_latitude, delivery.delivery_longitude]);
        });
        // Call GraphHopper for route optimization with weather awareness
        try {
            const adjustedRouteData = await getBestWeatherAwareRoute(points, true);
            // Extract route coordinates
            let routeCoordinates = [];
            if (adjustedRouteData.paths && adjustedRouteData.paths[0]) {
                const path = adjustedRouteData.paths[0];
                if (path.points) {
                    if (path.points_encoded && typeof path.points === 'string') {
                        // Points are encoded as polyline string - decode them
                        try {
                            const decoded = polyline.decode(path.points);
                            routeCoordinates = decoded;
                        }
                        catch (decodeError) {
                            console.error('Driver route polyline decode error:', decodeError);
                            routeCoordinates = points; // Fallback to input points
                        }
                    }
                    else if (path.points.coordinates) {
                        routeCoordinates = path.points.coordinates.map(([lng, lat]) => [lat, lng]);
                    }
                    else if (Array.isArray(path.points)) {
                        routeCoordinates = path.points;
                    }
                    else {
                        routeCoordinates = points;
                    }
                }
                else {
                    routeCoordinates = points;
                }
            }
            const response = {
                route: routeCoordinates,
                distance: adjustedRouteData.paths?.[0]?.distance || 0,
                duration: adjustedRouteData.paths?.[0]?.time || 0,
                deliveries: deliveries,
                weather_info: adjustedRouteData.paths?.[0]?.weather_penalties || null
            };
            res.json(response);
        }
        catch (apiError) {
            // Fallback to simple route if GraphHopper fails
            console.warn('GraphHopper API unavailable, using fallback route');
            res.json({
                route: points,
                distance: 0,
                duration: 0,
                deliveries: deliveries,
                fallback: true
            });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// General route calculation endpoint
app.post('/api/calculate-route', async (req, res) => {
    try {
        const { points } = req.body;
        if (!points || !Array.isArray(points) || points.length < 2) {
            return res.status(400).json({ error: 'At least 2 points are required' });
        }
        // Validate point format
        for (const point of points) {
            if (!Array.isArray(point) || point.length !== 2 || typeof point[0] !== 'number' || typeof point[1] !== 'number') {
                return res.status(400).json({ error: 'Points must be arrays of [latitude, longitude] numbers' });
            }
        }
        try {
            const adjustedRouteData = await getBestWeatherAwareRoute(points, false);
            // Extract route coordinates from GraphHopper response
            let routeCoordinates = [];
            if (adjustedRouteData.paths && adjustedRouteData.paths[0]) {
                const path = adjustedRouteData.paths[0];
                console.log('GraphHopper path data:', {
                    distance: path.distance,
                    time: path.time,
                    points_encoded: path.points_encoded,
                    points_type: typeof path.points,
                    points_sample: typeof path.points === 'string' ? path.points.substring(0, 100) + '...' : path.points,
                    weather_penalties: path.weather_penalties
                });
                if (path.points) {
                    if (path.points_encoded && typeof path.points === 'string') {
                        // Points are encoded as polyline string - decode them
                        try {
                            console.log('Decoding polyline string...');
                            const decoded = polyline.decode(path.points);
                            routeCoordinates = decoded; // polyline.decode returns [[lat, lng], [lat, lng], ...]
                            console.log(`Successfully decoded ${routeCoordinates.length} route points`);
                        }
                        catch (decodeError) {
                            console.error('Polyline decode error:', decodeError);
                            routeCoordinates = points; // Fallback to input points
                        }
                    }
                    else if (path.points.coordinates) {
                        // Points are GeoJSON format [lng, lat] -> convert to [lat, lng]
                        routeCoordinates = path.points.coordinates.map(([lng, lat]) => [lat, lng]);
                        console.log(`Using GeoJSON coordinates: ${routeCoordinates.length} points`);
                    }
                    else if (Array.isArray(path.points)) {
                        // Points are direct coordinate array
                        routeCoordinates = path.points;
                        console.log(`Using direct coordinate array: ${routeCoordinates.length} points`);
                    }
                    else {
                        console.log('Unknown points format, using input points as fallback');
                        routeCoordinates = points;
                    }
                }
                else {
                    console.log('No points found in GraphHopper response, using input points as fallback');
                    routeCoordinates = points;
                }
            }
            else {
                console.log('No paths found in GraphHopper response');
                routeCoordinates = points;
            }
            res.json({
                route: routeCoordinates,
                distance: adjustedRouteData.paths?.[0]?.distance || 0,
                duration: adjustedRouteData.paths?.[0]?.time || 0,
                weather_info: adjustedRouteData.paths?.[0]?.weather_penalties || null
            });
        }
        catch (apiError) {
            console.warn('GraphHopper API error:', apiError);
            res.json({
                route: points, // Fallback to straight line
                distance: 0,
                duration: 0,
                fallback: true
            });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Weather events endpoints
app.get('/api/weather-events', async (req, res) => {
    try {
        const events = await dbAll('SELECT * FROM weather_events');
        res.json(events);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/weather-events', async (req, res) => {
    try {
        const { id, type, latitude, longitude, radius } = req.body;
        if (!id || !type || latitude === undefined || longitude === undefined || radius === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        await dbRun('INSERT INTO weather_events (id, type, latitude, longitude, radius) VALUES (?, ?, ?, ?, ?)', [id, type, latitude, longitude, radius]);
        const event = await dbGet('SELECT * FROM weather_events WHERE id = ?', [id]);
        res.status(201).json(event);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Toggle weather event active status
app.patch('/api/weather-events/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        // Get current status
        const event = await dbGet('SELECT * FROM weather_events WHERE id = ?', [id]);
        if (!event) {
            return res.status(404).json({ error: 'Weather event not found' });
        }
        const newStatus = !event.active;
        await dbRun('UPDATE weather_events SET active = ? WHERE id = ?', [newStatus, id]);
        const updatedEvent = await dbGet('SELECT * FROM weather_events WHERE id = ?', [id]);
        res.json(updatedEvent);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        // Check GraphHopper connectivity
        let graphhopperStatus = 'unavailable';
        try {
            await callGraphHopper('/info', {});
            graphhopperStatus = 'connected';
        }
        catch (error) {
            // GraphHopper not available
        }
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {
                database: graphhopperStatus,
                graphhopper: graphhopperStatus
            }
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Driver simulation state management endpoints
let driverSimulationStates = {};
// Update driver position (called by admin dashboard during simulation)
app.put('/api/drivers/:driverId/position', async (req, res) => {
    try {
        const { driverId } = req.params;
        const simulationData = req.body;
        console.log(`📍 Admin updating position for driver ${driverId}:`, simulationData);
        // Store the simulation state
        driverSimulationStates[driverId] = {
            ...simulationData,
            lastUpdate: Date.now()
        };
        res.json({ success: true, driverId, timestamp: Date.now() });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get driver simulation state (called by mobile view)
app.get('/api/drivers/:driverId/simulation-state', async (req, res) => {
    try {
        const { driverId } = req.params;
        const simulationState = driverSimulationStates[driverId];
        if (!simulationState) {
            // Return basic driver data if no simulation state exists
            const driver = await dbGet('SELECT * FROM drivers WHERE id = ?', [driverId]);
            if (!driver) {
                return res.status(404).json({ error: 'Driver not found' });
            }
            // Get deliveries for the driver
            const deliveries = await dbAll('SELECT * FROM deliveries WHERE driver_id = ?', [driverId]);
            return res.json({
                ...driver,
                deliveries,
                isSimulating: false,
                simulationPosition: null,
                heading: 0
            });
        }
        console.log(`📱 Mobile requesting state for driver ${driverId}`);
        res.json(simulationState);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get all drivers with their simulation states (for dashboard)
app.get('/api/simulation/drivers', async (req, res) => {
    try {
        const drivers = await dbAll('SELECT * FROM drivers');
        const driversWithSimulation = drivers.map(driver => ({
            ...driver,
            simulationState: driverSimulationStates[driver.id] || null
        }));
        res.json(driversWithSimulation);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Initialize database and start server
async function startServer() {
    await initDatabase();
    app.listen(PORT, () => {
        console.log(`Backend server running on port ${PORT}`);
        console.log(`GraphHopper URL: ${GRAPHHOPPER_URL}`);
        console.log('🛣️  BIDIRECTIONAL ROUTING ENABLED - All roads are treated as two-way');
        console.log('💡 If routes seem restricted, restart GraphHopper with: java -jar graphhopper-web-6.2.jar server config.yml');
    });
}
startServer().catch(console.error);
