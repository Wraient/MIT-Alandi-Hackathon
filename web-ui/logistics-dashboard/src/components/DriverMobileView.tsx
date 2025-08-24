import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import * as L from 'leaflet';
import ApiService from '../services/api';
import 'leaflet/dist/leaflet.css';
import '../mobile.css';

// Custom driver icon for mobile
const createMobileDriverIcon = (isMoving: boolean = false) => {
    const color = isMoving ? '#10B981' : '#3B82F6';
    return new L.DivIcon({
        className: 'mobile-driver-icon',
        html: `
      <div style="
        width: 24px; 
        height: 24px; 
        background-color: ${color};
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      "></div>
    `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
};

// Pickup and delivery icons
const createMobileIcon = (color: string) => {
    return new L.DivIcon({
        className: 'mobile-marker-icon',
        html: `<div style="background-color: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });
};

const pickupIcon = createMobileIcon('#10B981');
const deliveryIcon = createMobileIcon('#F59E0B');

interface Driver {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    deliveries: Delivery[];
    currentRoute?: [number, number][];
    isMoving?: boolean;
    currentTarget?: 'pickup' | 'delivery';
    currentDeliveryIndex?: number;
    simulationPosition?: [number, number];
    activeRoute?: [number, number][];
    currentRouteIndex?: number;
}

interface Delivery {
    id: string;
    pickup_latitude: number;
    pickup_longitude: number;
    delivery_latitude: number;
    delivery_longitude: number;
    status: 'pending' | 'picked_up' | 'delivered';
}

const DriverMobileView: React.FC = () => {
    const [driverId, setDriverId] = useState<string>('');
    const [driver, setDriver] = useState<Driver | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [eta, setEta] = useState<string>('--:--');
    const [distance, setDistance] = useState<string>('--');
    const [isConnected, setIsConnected] = useState(false);

    const calculateETA = useCallback(async (driverData: Driver) => {
        if (!driverData.deliveries.length) return;

        try {
            // Get current position (simulation or actual)
            const currentPos: [number, number] = driverData.simulationPosition || [driverData.latitude, driverData.longitude];

            // Get next target based on delivery status
            let targetPos: [number, number];
            const currentDelivery = driverData.deliveries.find(d => d.status === 'pending') || driverData.deliveries[0];

            if (!currentDelivery) {
                setEta('All deliveries completed');
                setDistance('0 km');
                return;
            }

            // Determine target: pickup if pending, delivery if picked up
            if (currentDelivery.status === 'pending') {
                targetPos = [currentDelivery.pickup_latitude, currentDelivery.pickup_longitude];
            } else {
                targetPos = [currentDelivery.delivery_latitude, currentDelivery.delivery_longitude];
            }

            // Calculate route and ETA
            const routeResult = await ApiService.calculateRoute([currentPos, targetPos]);

            if (routeResult.distance && routeResult.duration) {
                const distanceKm = (routeResult.distance / 1000).toFixed(1);

                setDistance(`${distanceKm} km`);

                // Calculate ETA
                const now = new Date();
                const etaTime = new Date(now.getTime() + (routeResult.duration * 1000));
                setEta(etaTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            }

        } catch (err) {
            console.error('Failed to calculate ETA:', err);
        }
    }, []);

    // Real-time updates
    useEffect(() => {
        if (!driverId) return;

        const fetchDriverData = async () => {
            try {
                setLoading(true);
                setError(null);

                // Get all drivers and find the specific one
                const drivers = await ApiService.getDrivers();

                // Flexible driver ID matching
                let foundDriver: any = null;

                // Try exact match first
                foundDriver = drivers.find(d => d.id.toLowerCase() === driverId.toLowerCase());

                // If no exact match, try flexible matching
                if (!foundDriver) {
                    const searchId = driverId.toLowerCase();
                    foundDriver = drivers.find(d => {
                        const driverIdLower = d.id.toLowerCase();
                        // Match formats like: "1" -> "d001", "01" -> "d001", "d1" -> "d001"
                        if (searchId.match(/^\d+$/)) {
                            // Pure number: pad to 3 digits and add D prefix
                            const paddedId = `d${searchId.padStart(3, '0')}`;
                            return driverIdLower === paddedId;
                        } else if (searchId.match(/^d\d+$/)) {
                            // D + number: pad the number part
                            const numberPart = searchId.substring(1);
                            const paddedId = `d${numberPart.padStart(3, '0')}`;
                            return driverIdLower === paddedId;
                        }
                        // Fallback: partial match
                        return driverIdLower.includes(searchId) || searchId.includes(driverIdLower);
                    });
                }

                if (!foundDriver) {
                    const availableIds = drivers.map(d => d.id).join(', ');
                    console.log('Available driver IDs:', availableIds);
                    setError(`Driver not found. Available drivers: ${availableIds || 'None'}`);
                    setDriver(null);
                    return;
                }

                // Get deliveries for this driver
                const deliveries = await ApiService.getDeliveries();
                const driverDeliveries = deliveries.filter(d => d.driver_id === foundDriver.id);

                const driverWithDeliveries = {
                    ...foundDriver,
                    deliveries: driverDeliveries
                };

                setDriver(driverWithDeliveries);
                setIsConnected(true);

                // Calculate ETA if driver has deliveries
                if (driverDeliveries.length > 0) {
                    await calculateETA(driverWithDeliveries);
                }

            } catch (err: any) {
                console.error('Failed to fetch driver data:', err);
                setError('Failed to load driver data');
                setIsConnected(false);
            } finally {
                setLoading(false);
            }
        };

        // Initial fetch
        fetchDriverData();

        // Set up real-time polling every 2 seconds
        const interval = setInterval(fetchDriverData, 2000);

        return () => clearInterval(interval);
    }, [driverId, calculateETA]);

    const handleDriverIdSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (driverId.trim()) {
            // Auto-format the driver ID for better user experience
            let formattedId = driverId.trim().toUpperCase();
            if (formattedId.match(/^\d+$/)) {
                // If user entered just numbers, add D prefix and pad
                formattedId = `D${formattedId.padStart(3, '0')}`;
            }
            setDriverId(formattedId);
        }
    };

    const getCurrentDelivery = () => {
        if (!driver) return null;
        return driver.deliveries.find(d => d.status !== 'delivered') || driver.deliveries[0];
    };

    const getDriverStatus = () => {
        if (!driver) return 'Not connected';
        if (driver.deliveries.length === 0) return 'No deliveries assigned';
        if (driver.isMoving) {
            const currentDelivery = getCurrentDelivery();
            if (!currentDelivery) return 'All deliveries completed';
            return currentDelivery.status === 'pending' ? 'Going to pickup' : 'Delivering';
        }
        return 'Ready to start';
    };

    const getRouteToShow = () => {
        if (!driver) return [];

        // If driver is moving and has an active route, show remaining route
        if (driver.activeRoute && driver.isMoving && driver.currentRouteIndex !== undefined) {
            return driver.activeRoute.slice(driver.currentRouteIndex);
        }

        // Otherwise show planned route if available
        return driver.currentRoute || [];
    };

    if (!driverId) {
        return (
            <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
                    <div className="text-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Driver Portal</h1>
                        <p className="text-gray-600">Enter your driver ID to access your route</p>
                        <p className="text-sm text-gray-500 mt-1">Examples: 1, 01, D001, or D1</p>
                    </div>

                    <form onSubmit={handleDriverIdSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Driver ID
                            </label>
                            <input
                                type="text"
                                value={driverId}
                                onChange={(e) => setDriverId(e.target.value)}
                                placeholder="Enter: 1, D001, etc."
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                                required
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                You can enter just the number (e.g., "1" for D001)
                            </p>
                        </div>

                        <button
                            type="submit"
                            className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition-colors font-medium text-lg"
                            disabled={!driverId.trim()}
                        >
                            Connect
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    if (loading && !driver) {
        return (
            <div className="min-h-screen bg-blue-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Connecting to driver {driverId}...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md text-center">
                    <div className="text-red-500 text-4xl mb-4">⚠️</div>
                    <h2 className="text-xl font-bold text-red-800 mb-2">Connection Error</h2>
                    <p className="text-red-600 mb-4">{error}</p>
                    <button
                        onClick={() => setDriverId('')}
                        className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600 transition-colors"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    const currentDelivery = getCurrentDelivery();
    const driverPosition = driver?.simulationPosition || [driver?.latitude || 0, driver?.longitude || 0];
    const routeToShow = getRouteToShow();

    return (
        <div className="min-h-screen bg-gray-100">
            {/* Header */}
            <div className="bg-white shadow-sm">
                <div className="p-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">{driver?.name}</h1>
                        <p className="text-sm text-gray-600">ID: {driver?.id}</p>
                    </div>
                    <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} mr-2`}></div>
                        <span className="text-sm text-gray-600">{isConnected ? 'Live' : 'Offline'}</span>
                    </div>
                </div>
            </div>

            {/* Status Cards */}
            <div className="p-4 space-y-4">
                {/* ETA Card */}
                <div className="bg-white rounded-lg shadow-sm p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">ETA</p>
                            <p className="text-2xl font-bold text-blue-600">{eta}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-gray-600">Distance</p>
                            <p className="text-lg font-semibold text-gray-900">{distance}</p>
                        </div>
                    </div>
                </div>

                {/* Status Card */}
                <div className="bg-white rounded-lg shadow-sm p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Status</p>
                            <p className="text-lg font-semibold text-gray-900">{getDriverStatus()}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-gray-600">Deliveries</p>
                            <p className="text-lg font-semibold text-gray-900">
                                {driver?.deliveries.filter(d => d.status === 'delivered').length || 0}/
                                {driver?.deliveries.length || 0}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Current Delivery Card */}
                {currentDelivery && (
                    <div className="bg-white rounded-lg shadow-sm p-4">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Current Delivery</h3>
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Delivery ID:</span>
                                <span className="text-sm font-medium">{currentDelivery.id}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Status:</span>
                                <span className={`text-sm font-medium capitalize ${currentDelivery.status === 'pending' ? 'text-orange-600' :
                                        currentDelivery.status === 'picked_up' ? 'text-blue-600' : 'text-green-600'
                                    }`}>
                                    {currentDelivery.status.replace('_', ' ')}
                                </span>
                            </div>
                            {currentDelivery.status === 'pending' && (
                                <div className="text-sm text-gray-600">
                                    Next: Go to pickup location
                                </div>
                            )}
                            {currentDelivery.status === 'picked_up' && (
                                <div className="text-sm text-gray-600">
                                    Next: Deliver to customer
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Map */}
            <div className="p-4">
                <div className="bg-white rounded-lg shadow-sm overflow-hidden" style={{ height: '400px' }}>
                    <MapContainer
                        center={driverPosition}
                        zoom={15}
                        className="h-full w-full"
                    >
                        <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        />

                        {/* Driver Marker */}
                        {driver && (
                            <Marker
                                position={driverPosition}
                                icon={createMobileDriverIcon(driver.isMoving)}
                            />
                        )}

                        {/* Route Path (only ahead) */}
                        {routeToShow.length > 1 && (
                            <Polyline
                                positions={routeToShow}
                                color="#10B981"
                                weight={4}
                                opacity={0.8}
                                dashArray="10, 5"
                            />
                        )}

                        {/* Pickup/Delivery Markers for current delivery */}
                        {currentDelivery && (
                            <>
                                <Marker
                                    position={[currentDelivery.pickup_latitude, currentDelivery.pickup_longitude]}
                                    icon={pickupIcon}
                                />
                                <Marker
                                    position={[currentDelivery.delivery_latitude, currentDelivery.delivery_longitude]}
                                    icon={deliveryIcon}
                                />
                            </>
                        )}
                    </MapContainer>
                </div>
            </div>

            {/* Bottom Navigation */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
                <div className="flex space-x-2">
                    <button
                        onClick={() => setDriverId('')}
                        className="flex-1 bg-gray-500 text-white py-3 px-4 rounded-lg hover:bg-gray-600 transition-colors font-medium"
                    >
                        Disconnect
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        className="flex-1 bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition-colors font-medium"
                    >
                        Refresh
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DriverMobileView;
