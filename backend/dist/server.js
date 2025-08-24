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
const GRAPHHOPPER_URL = 'http://localhost:8989';
// Helper function to call GraphHopper API
async function callGraphHopper(endpoint, params) {
    try {
        const response = await axios_1.default.get(`${GRAPHHOPPER_URL}${endpoint}`, { params });
        return response.data;
    }
    catch (error) {
        console.error('GraphHopper API error:', error.message);
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
        // Call GraphHopper for route optimization
        try {
            const routeData = await callGraphHopper('/route', {
                point: points.map(([lat, lng]) => `${lat},${lng}`),
                profile: 'car',
                optimize: 'true',
                instructions: 'false',
                calc_points: 'true',
                debug: 'true'
            });
            // Extract route coordinates
            let routeCoordinates = [];
            if (routeData.paths && routeData.paths[0] && routeData.paths[0].points) {
                // Decode the points if they're encoded
                if (typeof routeData.paths[0].points === 'string') {
                    // For encoded polyline, we'd need to decode it
                    // For now, let's use the direct coordinates approach
                    routeCoordinates = points;
                }
                else if (routeData.paths[0].points.coordinates) {
                    routeCoordinates = routeData.paths[0].points.coordinates.map(([lng, lat]) => [lat, lng]);
                }
            }
            const response = {
                route: routeCoordinates,
                distance: routeData.paths?.[0]?.distance || 0,
                duration: routeData.paths?.[0]?.time || 0,
                deliveries: deliveries
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
                database: 'connected',
                graphhopper: graphhopperStatus
            }
        });
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
    });
}
startServer().catch(console.error);
