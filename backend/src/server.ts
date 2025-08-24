import express from 'express';
import cors from 'cors';
import axios from 'axios';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';

// Import polyline with type declaration
const polyline = require('@mapbox/polyline');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize SQLite database
const db = new sqlite3.Database(':memory:'); // In-memory database for demo
const dbRun = promisify(db.run.bind(db)) as (sql: string, params?: any[]) => Promise<any>;
const dbGet = promisify(db.get.bind(db)) as (sql: string, params?: any[]) => Promise<any>;
const dbAll = promisify(db.all.bind(db)) as (sql: string, params?: any[]) => Promise<any[]>;

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
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

// GraphHopper API configuration
const GRAPHHOPPER_URL = 'http://localhost:8989';

// Helper function to call GraphHopper API
async function callGraphHopper(endpoint: string, params: any) {
    try {
        // Handle multiple point parameters correctly
        const urlParams = new URLSearchParams();

        for (const [key, value] of Object.entries(params)) {
            if (key === 'point' && Array.isArray(value)) {
                // Add each point as a separate parameter
                value.forEach((point: string) => {
                    urlParams.append('point', point);
                });
            } else {
                urlParams.append(key, value as string);
            }
        }

        const url = `${GRAPHHOPPER_URL}${endpoint}?${urlParams.toString()}`;
        console.log('GraphHopper request URL:', url);

        const response = await axios.get(url);
        return response.data;
    } catch (error: any) {
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
    } catch (error: any) {
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

        await dbRun(
            'INSERT INTO drivers (id, name, latitude, longitude) VALUES (?, ?, ?, ?)',
            [id, name, latitude, longitude]
        );

        const driver = await dbGet('SELECT * FROM drivers WHERE id = ?', [id]);
        res.status(201).json(driver);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get all deliveries
app.get('/api/deliveries', async (req, res) => {
    try {
        const deliveries = await dbAll('SELECT * FROM deliveries');
        res.json(deliveries);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Add new delivery
app.post('/api/deliveries', async (req, res) => {
    try {
        const {
            id,
            driver_id,
            pickup_latitude,
            pickup_longitude,
            delivery_latitude,
            delivery_longitude
        } = req.body;

        if (!id || pickup_latitude === undefined || pickup_longitude === undefined ||
            delivery_latitude === undefined || delivery_longitude === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        await dbRun(
            'INSERT INTO deliveries (id, driver_id, pickup_latitude, pickup_longitude, delivery_latitude, delivery_longitude) VALUES (?, ?, ?, ?, ?, ?)',
            [id, driver_id, pickup_latitude, pickup_longitude, delivery_latitude, delivery_longitude]
        );

        const delivery = await dbGet('SELECT * FROM deliveries WHERE id = ?', [id]);
        res.status(201).json(delivery);
    } catch (error: any) {
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
        const deliveries = await dbAll(
            'SELECT * FROM deliveries WHERE driver_id = ? AND status = ?',
            [driverId, 'pending']
        );

        if (deliveries.length === 0) {
            return res.json({ route: [], distance: 0, duration: 0 });
        }

        // Build points for GraphHopper (driver location + all pickup/delivery points)
        const points: [number, number][] = [[driver.latitude, driver.longitude]];

        deliveries.forEach(delivery => {
            points.push([delivery.pickup_latitude, delivery.pickup_longitude]);
            points.push([delivery.delivery_latitude, delivery.delivery_longitude]);
        });

        // Call GraphHopper for route optimization
        try {
            const routeData = await callGraphHopper('/route', {
                point: points.map(([lat, lng]) => `${lat},${lng}`),
                type: 'json',
                locale: 'en-US',
                key: '',
                elevation: 'false',
                profile: 'car',
                optimize: 'true'
            });

            // Extract route coordinates
            let routeCoordinates: [number, number][] = [];
            if (routeData.paths && routeData.paths[0]) {
                const path = routeData.paths[0];

                if (path.points) {
                    if (path.points_encoded && typeof path.points === 'string') {
                        // Points are encoded as polyline string - decode them
                        try {
                            const decoded = polyline.decode(path.points);
                            routeCoordinates = decoded;
                        } catch (decodeError) {
                            console.error('Driver route polyline decode error:', decodeError);
                            routeCoordinates = points; // Fallback to input points
                        }
                    } else if (path.points.coordinates) {
                        routeCoordinates = path.points.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
                    } else if (Array.isArray(path.points)) {
                        routeCoordinates = path.points;
                    } else {
                        routeCoordinates = points;
                    }
                } else {
                    routeCoordinates = points;
                }
            }

            const response = {
                route: routeCoordinates,
                distance: routeData.paths?.[0]?.distance || 0,
                duration: routeData.paths?.[0]?.time || 0,
                deliveries: deliveries
            };

            res.json(response);
        } catch (apiError) {
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
    } catch (error: any) {
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
            const routeData = await callGraphHopper('/route', {
                point: points.map(([lat, lng]: [number, number]) => `${lat},${lng}`),
                type: 'json',
                locale: 'en-US',
                key: '',
                elevation: 'false',
                profile: 'car'
            });

            // Extract route coordinates from GraphHopper response
            let routeCoordinates: [number, number][] = [];
            if (routeData.paths && routeData.paths[0]) {
                const path = routeData.paths[0];
                console.log('GraphHopper path data:', {
                    distance: path.distance,
                    time: path.time,
                    points_encoded: path.points_encoded,
                    points_type: typeof path.points,
                    points_sample: typeof path.points === 'string' ? path.points.substring(0, 100) + '...' : path.points
                });

                if (path.points) {
                    if (path.points_encoded && typeof path.points === 'string') {
                        // Points are encoded as polyline string - decode them
                        try {
                            console.log('Decoding polyline string...');
                            const decoded = polyline.decode(path.points);
                            routeCoordinates = decoded; // polyline.decode returns [[lat, lng], [lat, lng], ...]
                            console.log(`Successfully decoded ${routeCoordinates.length} route points`);
                        } catch (decodeError) {
                            console.error('Polyline decode error:', decodeError);
                            routeCoordinates = points; // Fallback to input points
                        }
                    } else if (path.points.coordinates) {
                        // Points are GeoJSON format [lng, lat] -> convert to [lat, lng]
                        routeCoordinates = path.points.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
                        console.log(`Using GeoJSON coordinates: ${routeCoordinates.length} points`);
                    } else if (Array.isArray(path.points)) {
                        // Points are direct coordinate array
                        routeCoordinates = path.points;
                        console.log(`Using direct coordinate array: ${routeCoordinates.length} points`);
                    } else {
                        console.log('Unknown points format, using input points as fallback');
                        routeCoordinates = points;
                    }
                } else {
                    console.log('No points found in GraphHopper response, using input points as fallback');
                    routeCoordinates = points;
                }
            } else {
                console.log('No paths found in GraphHopper response');
                routeCoordinates = points;
            }

            res.json({
                route: routeCoordinates,
                distance: routeData.paths?.[0]?.distance || 0,
                duration: routeData.paths?.[0]?.time || 0
            });
        } catch (apiError) {
            console.warn('GraphHopper API error:', apiError);
            res.json({
                route: points, // Fallback to straight line
                distance: 0,
                duration: 0,
                fallback: true
            });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Weather events endpoints
app.get('/api/weather-events', async (req, res) => {
    try {
        const events = await dbAll('SELECT * FROM weather_events');
        res.json(events);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/weather-events', async (req, res) => {
    try {
        const { id, type, latitude, longitude, radius } = req.body;

        if (!id || !type || latitude === undefined || longitude === undefined || radius === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        await dbRun(
            'INSERT INTO weather_events (id, type, latitude, longitude, radius) VALUES (?, ?, ?, ?, ?)',
            [id, type, latitude, longitude, radius]
        );

        const event = await dbGet('SELECT * FROM weather_events WHERE id = ?', [id]);
        res.status(201).json(event);
    } catch (error: any) {
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
    } catch (error: any) {
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
        } catch (error) {
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
    } catch (error: any) {
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
