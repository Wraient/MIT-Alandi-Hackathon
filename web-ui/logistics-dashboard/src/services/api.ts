import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
});

export interface Driver {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    status?: string;
    created_at?: string;
}

export interface Delivery {
    id: string;
    driver_id?: string;
    pickup_latitude: number;
    pickup_longitude: number;
    delivery_latitude: number;
    delivery_longitude: number;
    status: 'pending' | 'picked_up' | 'delivered';
    estimated_duration?: number;
    actual_duration?: number;
    created_at?: string;
    updated_at?: string;
}

export interface WeatherEvent {
    id: string;
    type: 'traffic' | 'storm';
    latitude: number;
    longitude: number;
    radius: number;
    active: boolean;
    created_at?: string;
}

export interface RouteResponse {
    route: [number, number][];
    distance: number;
    duration: number;
    deliveries: Delivery[];
    fallback?: boolean;
}

class ApiService {
    // Drivers API
    async getDrivers(): Promise<Driver[]> {
        const response = await api.get('/drivers');
        return response.data;
    }

    async addDriver(driver: Omit<Driver, 'created_at'>): Promise<Driver> {
        const response = await api.post('/drivers', driver);
        return response.data;
    }

    // Deliveries API
    async getDeliveries(): Promise<Delivery[]> {
        const response = await api.get('/deliveries');
        return response.data;
    }

    async addDelivery(delivery: Omit<Delivery, 'created_at' | 'updated_at'>): Promise<Delivery> {
        const response = await api.post('/deliveries', delivery);
        return response.data;
    }

    // Routes API
    async getDriverRoute(driverId: string): Promise<RouteResponse> {
        const response = await api.get(`/drivers/${driverId}/route`);
        return response.data;
    }

    // Weather Events API
    async getWeatherEvents(): Promise<WeatherEvent[]> {
        const response = await api.get('/weather-events');
        return response.data;
    }

    async addWeatherEvent(event: Omit<WeatherEvent, 'created_at'>): Promise<WeatherEvent> {
        const response = await api.post('/weather-events', event);
        return response.data;
    }

    async toggleWeatherEvent(eventId: string): Promise<WeatherEvent> {
        const response = await api.patch(`/weather-events/${eventId}/toggle`);
        return response.data;
    }

    // Health Check
    async getHealthStatus(): Promise<any> {
        const response = await api.get('/health');
        return response.data;
    }

    // GraphHopper Integration
    async calculateRoute(points: [number, number][]): Promise<any> {
        // This would be used for direct GraphHopper API calls if needed
        // For now, we use the backend proxy
        const queryPoints = points.map(([lat, lng]) => `${lat},${lng}`).join('&point=');
        const graphhopperUrl = `http://localhost:8989/route?point=${queryPoints}&profile=car&instructions=false&calc_points=true`;

        try {
            const response = await axios.get(graphhopperUrl);
            return response.data;
        } catch (error) {
            console.error('Direct GraphHopper call failed:', error);
            throw error;
        }
    }
}

const apiService = new ApiService();
export default apiService;
