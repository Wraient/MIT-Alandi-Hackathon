import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import { Icon, DivIcon } from 'leaflet';
import { useAppContext } from '../contexts/AppContext';
import ApiService, { Driver } from '../services/api';
import 'leaflet/dist/leaflet.css';
import '../mobile.css';

// Google Maps-like interface component with rotation
const DriverTracker: React.FC<{ driver: any; bearing: number; navigationMode: boolean }> = ({ driver, bearing, navigationMode }) => {
    const map = useMap();

    useEffect(() => {
        if (driver?.simulationPosition && map) {
            // Center map on driver position
            map.setView(driver.simulationPosition, 18, { animate: true, duration: 0.3 });

            // Rotate map only in navigation mode
            if (navigationMode && bearing !== null && bearing !== undefined && driver?.isMoving) {
                // Set the bearing (rotation) of the map
                // In Leaflet, bearing is the angle from north, so we need to rotate opposite direction
                const mapContainer = map.getContainer();
                const mapBearing = -bearing; // Negative to rotate map opposite to movement direction

                mapContainer.style.transform = `rotate(${mapBearing}deg)`;
                mapContainer.style.transformOrigin = 'center';
                mapContainer.style.transition = 'transform 0.5s ease-out';

                console.log(`🗺️ Map rotated to ${mapBearing}° (driver bearing: ${bearing}°)`);
            } else if (!navigationMode || !driver?.isMoving) {
                // Reset rotation when navigation mode is off or when stopped
                const mapContainer = map.getContainer();
                mapContainer.style.transform = 'rotate(0deg)';
                mapContainer.style.transition = 'transform 1s ease-out';
            }

            console.log(`🗺️ Map updated - position:`, driver.simulationPosition, `bearing: ${bearing}°, moving: ${driver?.isMoving}, nav: ${navigationMode}`);
        }
    }, [driver?.simulationPosition, bearing, driver?.isMoving, navigationMode, map]);

    return null;
};

// Rotating driver arrow icon that always points "forward" in navigation mode
const createDriverArrow = (bearing: number = 0, isMoving: boolean = false, navigationMode: boolean = true) => {
    const color = isMoving ? '#10B981' : '#3B82F6'; // Green when moving, blue when stopped
    const size = 28;

    // In navigation mode (map rotates), arrow always points up (0°)
    // In normal mode (map doesn't rotate), arrow points to bearing direction
    const arrowRotation = navigationMode && isMoving ? 0 : bearing;

    return new DivIcon({
        className: 'driver-arrow-icon',
        html: `
            <div style="
                width: ${size}px; 
                height: ${size}px;
                transform: rotate(${arrowRotation}deg);
                transition: transform 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3));
            ">
                <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L22 20H12H2L12 2Z" fill="${color}" stroke="white" stroke-width="2"/>
                    <circle cx="12" cy="16" r="2" fill="white"/>
                    <circle cx="12" cy="8" r="1" fill="white"/>
                </svg>
            </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
    });
};

const DriverMobileView: React.FC = () => {
    // Parse URL parameters
    const urlParams = Object.fromEntries(new URLSearchParams(window.location.search));
    const driverId = urlParams.driver || 'D001';

    // App context for shared driver data
    const { getSharedDriver, appState, updateSharedDriver } = useAppContext();

    // State for Google Maps-like interface
    const [driver, setDriver] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [currentBearing, setCurrentBearing] = useState(0);
    const [showInfo, setShowInfo] = useState(false);
    const [isSimulating, setIsSimulating] = useState(false);
    const [simulationInterval, setSimulationInterval] = useState<NodeJS.Timeout | null>(null);
    const [navigationMode, setNavigationMode] = useState(true); // Enable navigation mode by default

    const mapRef = useRef<any>(null);

    // Get real-time driver data from web UI (passive display only)
    useEffect(() => {
        if (!driverId) return;

        console.log(`📱 Mobile view starting for driver: ${driverId}`);

        const fetchInitialDriverData = async () => {
            try {
                const drivers = await ApiService.getDrivers();
                const foundDriver = drivers.find((d: any) => d.id === driverId);

                if (foundDriver) {
                    const deliveries = await ApiService.getDeliveries();
                    const driverDeliveries = deliveries.filter((d: any) => d.driver_id === foundDriver.id);

                    const driverWithDeliveries = {
                        ...foundDriver,
                        deliveries: driverDeliveries,
                        isMoving: false,
                        speed: 0
                    };

                    console.log(`📱 Initial driver data loaded:`, driverWithDeliveries);
                    setDriver(driverWithDeliveries);
                    setIsConnected(true);
                    setError(null);
                } else {
                    setError(`Driver ${driverId} not found`);
                }
            } catch (error) {
                console.error('📱 Error fetching initial driver data:', error);
                setError('Failed to load driver data');
            } finally {
                setLoading(false);
            }
        };

        fetchInitialDriverData();

        // Poll for shared driver data from admin UI every 100ms
        const sharedDataInterval = setInterval(() => {
            const sharedDriver = getSharedDriver(driverId);
            if (sharedDriver) {
                console.log(`📱 Received shared driver data:`, {
                    id: sharedDriver.id,
                    name: sharedDriver.name,
                    isMoving: sharedDriver.isMoving,
                    speed: sharedDriver.speed,
                    position: sharedDriver.simulationPosition,
                    bearing: sharedDriver.movementDirection || sharedDriver.heading
                });

                setDriver(sharedDriver);
                setIsConnected(true);
                setError(null);

                // Update bearing from shared data
                if (sharedDriver.movementDirection !== undefined) {
                    setCurrentBearing(sharedDriver.movementDirection);
                } else if (sharedDriver.heading !== undefined) {
                    setCurrentBearing(sharedDriver.heading);
                }
            }
        }, 100);

        return () => {
            clearInterval(sharedDataInterval);
        };
    }, [driverId, getSharedDriver]);

    // Mobile view now fetches data from backend and runs its own simulation
    useEffect(() => {
        setLoading(false);

        if (driverId) {
            console.log(`📱 Mobile view initialized for driver: ${driverId}`);

            const fetchDriverData = async () => {
                try {
                    // Fetch driver data from backend API
                    const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001/api'}/drivers/${driverId}/simulation-state`);
                    const driverData = await response.json();

                    console.log(`📱 Fetched driver data from API:`, driverData);

                    // Update local state with fetched data
                    setDriver(driverData);

                    // If driver has deliveries and we need to start simulation
                    if (driverData.deliveries?.length > 0 && !driverData.simulationPosition) {
                        console.log(`📱 Driver has ${driverData.deliveries.length} deliveries, initializing simulation...`);
                        await initializeDriverSimulation(driverData);
                    }

                } catch (error) {
                    console.error('📱 Error fetching driver data:', error);
                    setError(`Failed to fetch driver data: ${error}`);
                }
            };

            // Fetch data immediately
            fetchDriverData();

            // Poll for updates every 2 seconds to check if dashboard has new data
            const pollInterval = setInterval(fetchDriverData, 2000);

            return () => clearInterval(pollInterval);
        }
    }, [driverId]);

    // Initialize simulation when driver has deliveries
    const initializeDriverSimulation = async (driverData: any) => {
        try {
            if (!driverData.deliveries?.length) return;

            console.log(`📱 Initializing simulation for ${driverData.name}`);

            // Get the first pending delivery
            const currentDelivery = driverData.deliveries.find((d: any) => d.status === 'pending') || driverData.deliveries[0];
            if (!currentDelivery) return;

            // Calculate route from driver position to pickup location using our API
            const routePoints = [
                [driverData.latitude, driverData.longitude],
                [currentDelivery.pickup_latitude, currentDelivery.pickup_longitude]
            ];

            console.log(`📱 Calculating route from ${routePoints[0]} to ${routePoints[1]}`);

            const routeResponse = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001/api'}/calculate-route`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ points: routePoints })
            });

            const routeResult = await routeResponse.json();
            console.log(`📱 Received route with ${routeResult.route?.length || 0} points`);

            // Update driver with simulation data
            setDriver((prev: any) => ({
                ...prev,
                simulationPosition: [driverData.latitude, driverData.longitude],
                isMoving: true,
                currentTarget: 'pickup',
                currentDeliveryIndex: 0,
                activeRoute: routeResult.route || [],
                currentRouteIndex: 0,
                speed: 50 // Default speed
            }));

            // Start the mobile simulation
            setIsSimulating(true);

        } catch (error) {
            console.error('📱 Error initializing simulation:', error);
        }
    };

    // Mobile simulation logic - runs independent movement simulation
    useEffect(() => {
        if (!isSimulating || !driver?.simulationPosition || !driver?.activeRoute?.length) {
            return;
        }

        console.log(`📱 Starting movement simulation for ${driver.name}`);

        const moveDriver = () => {
            setDriver((prevDriver: any) => {
                if (!prevDriver?.isMoving || !prevDriver?.simulationPosition || !prevDriver?.activeRoute?.length) {
                    return prevDriver;
                }

                const currentRouteIndex = prevDriver.currentRouteIndex || 0;

                if (currentRouteIndex >= prevDriver.activeRoute.length) {
                    // Reached end of current route
                    console.log(`📱 Driver ${prevDriver.name} reached end of route`);

                    const currentDelivery = prevDriver.deliveries[prevDriver.currentDeliveryIndex || 0];
                    if (!currentDelivery) return prevDriver;

                    if (prevDriver.currentTarget === 'pickup') {
                        // Reached pickup, calculate route to delivery
                        console.log(`📱 Reached pickup, going to delivery`);
                        calculateNextRoute(prevDriver, [currentDelivery.delivery_latitude, currentDelivery.delivery_longitude], 'delivery');
                        return prevDriver;
                    } else {
                        // Reached delivery, move to next delivery or stop
                        console.log(`📱 Reached delivery`);
                        const nextDeliveryIndex = (prevDriver.currentDeliveryIndex || 0) + 1;

                        if (nextDeliveryIndex < prevDriver.deliveries.length) {
                            const nextDelivery = prevDriver.deliveries[nextDeliveryIndex];
                            calculateNextRoute(prevDriver, [nextDelivery.pickup_latitude, nextDelivery.pickup_longitude], 'pickup', nextDeliveryIndex);
                            return {
                                ...prevDriver,
                                deliveries: prevDriver.deliveries.map((d: any, idx: number) =>
                                    idx === (prevDriver.currentDeliveryIndex || 0) ? { ...d, status: 'delivered' } : d
                                )
                            };
                        } else {
                            // All deliveries completed
                            console.log(`📱 All deliveries completed for ${prevDriver.name}`);
                            setIsSimulating(false);
                            return {
                                ...prevDriver,
                                isMoving: false,
                                deliveries: prevDriver.deliveries.map((d: any, idx: number) =>
                                    idx === (prevDriver.currentDeliveryIndex || 0) ? { ...d, status: 'delivered' } : d
                                )
                            };
                        }
                    }
                }

                // Move towards next route point
                const targetPoint = prevDriver.activeRoute[currentRouteIndex];
                const newPos = moveTowardsTarget(
                    prevDriver.simulationPosition,
                    targetPoint,
                    prevDriver.speed || 50, // Default 50 km/h
                    100 // 100ms interval
                );

                // Calculate bearing
                const bearing = calculateBearing(prevDriver.simulationPosition, targetPoint);
                setCurrentBearing(bearing);

                // Check if reached current route point
                const distanceToPoint = calculateDistance(newPos, targetPoint);
                const hasReachedPoint = distanceToPoint < 0.01; // Within 10 meters

                const updatedDriver = {
                    ...prevDriver,
                    simulationPosition: hasReachedPoint ? targetPoint : newPos,
                    currentRouteIndex: hasReachedPoint ? currentRouteIndex + 1 : currentRouteIndex,
                    heading: bearing
                };

                return updatedDriver;
            });
        };

        const interval = setInterval(moveDriver, 100); // Update every 100ms
        setSimulationInterval(interval);

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isSimulating, driver?.simulationPosition, driver?.activeRoute]);

    // Helper function to calculate next route
    const calculateNextRoute = async (currentDriver: any, targetPos: [number, number], targetType: 'pickup' | 'delivery', deliveryIndex?: number) => {
        try {
            const routePoints = [currentDriver.simulationPosition, targetPos];

            const routeResponse = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001/api'}/calculate-route`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ points: routePoints })
            });

            const routeResult = await routeResponse.json();
            console.log(`📱 Calculated route to ${targetType}:`, routeResult.route?.length || 0, 'points');

            setDriver((prev: any) => ({
                ...prev,
                currentTarget: targetType,
                currentDeliveryIndex: deliveryIndex !== undefined ? deliveryIndex : prev.currentDeliveryIndex,
                activeRoute: routeResult.route || [],
                currentRouteIndex: 0,
                deliveries: prev.deliveries.map((d: any, idx: number) =>
                    idx === (prev.currentDeliveryIndex || 0) && targetType === 'delivery'
                        ? { ...d, status: 'picked_up' }
                        : d
                )
            }));
        } catch (error) {
            console.error('📱 Error calculating next route:', error);
        }
    };

    // Movement utility functions
    const calculateDistance = (pos1: [number, number], pos2: [number, number]): number => {
        const [lat1, lng1] = pos1;
        const [lat2, lng2] = pos2;
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const calculateBearing = (pos1: [number, number], pos2: [number, number]): number => {
        const [lat1, lng1] = pos1;
        const [lat2, lng2] = pos2;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const lat1Rad = lat1 * Math.PI / 180;
        const lat2Rad = lat2 * Math.PI / 180;

        const y = Math.sin(dLng) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

        const bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360;
    };

    const moveTowardsTarget = (currentPos: [number, number], targetPos: [number, number], speedKmh: number, deltaTimeMs: number): [number, number] => {
        const distanceKm = calculateDistance(currentPos, targetPos);
        const speedKmPerMs = speedKmh / (1000 * 60 * 60);
        const moveDistanceKm = speedKmPerMs * deltaTimeMs;

        if (distanceKm <= moveDistanceKm) {
            return targetPos;
        }

        const bearing = calculateBearing(currentPos, targetPos) * Math.PI / 180;
        const R = 6371;
        const [lat1, lng1] = currentPos;
        const lat1Rad = lat1 * Math.PI / 180;
        const lng1Rad = lng1 * Math.PI / 180;
        const angularDistance = moveDistanceKm / R;

        const lat2Rad = Math.asin(
            Math.sin(lat1Rad) * Math.cos(angularDistance) +
            Math.cos(lat1Rad) * Math.sin(angularDistance) * Math.cos(bearing)
        );

        const lng2Rad = lng1Rad + Math.atan2(
            Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1Rad),
            Math.cos(angularDistance) - Math.sin(lat1Rad) * Math.sin(lat2Rad)
        );

        return [lat2Rad * 180 / Math.PI, lng2Rad * 180 / Math.PI];
    };

    // Clean up simulation on unmount
    useEffect(() => {
        return () => {
            if (simulationInterval) {
                clearInterval(simulationInterval);
            }
        };
    }, [simulationInterval]);

    // Get driver position
    const getDriverPosition = (): [number, number] => {
        if (driver?.simulationPosition) {
            return driver.simulationPosition;
        }
        return driver ? [driver.latitude, driver.longitude] : [18.5204, 73.8567];
    };

    // Get driver route with real-time updates
    const getDriverRoute = () => {
        if (!driver) return [];

        // Check multiple route sources in priority order
        let route = [];

        // 1. Active route (currently being followed)
        if (driver.activeRoute && driver.activeRoute.length > 0) {
            route = driver.activeRoute;
            console.log(`📍 Using activeRoute with ${route.length} points`);
        }
        // 2. Current route (planned route)
        else if (driver.currentRoute && driver.currentRoute.length > 0) {
            route = driver.currentRoute;
            console.log(`📍 Using currentRoute with ${route.length} points`);
        }
        // 3. Check if there's a route in the driver data
        else if (driver.route && driver.route.length > 0) {
            route = driver.route;
            console.log(`📍 Using driver.route with ${route.length} points`);
        }
        else {
            console.log(`📍 No route found for driver ${driver.id}`);
        }

        return route;
    };

    if (loading) {
        return (
            <div className="google-maps-container">
                <div className="loading-overlay">
                    <div className="loading-spinner"></div>
                    <p>Loading GPS...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="google-maps-container">
                <div className="error-overlay">
                    <div className="error-icon">⚠️</div>
                    <p>GPS Connection Error</p>
                    <small>{error}</small>
                </div>
            </div>
        );
    }

    const driverPosition = getDriverPosition();
    const driverRoute = getDriverRoute();
    const isMoving = driver?.isMoving || false;
    const speed = driver?.speed || driver?.simulationSpeed || 0;

    console.log(`📱 Mobile View Status:`, {
        driverId,
        isConnected,
        hasDriver: !!driver,
        driverPosition,
        routePoints: driverRoute.length,
        isMoving,
        speed,
        bearing: currentBearing
    });

    return (
        <div className="google-maps-container">
            {/* Google Maps-like Status Bar */}
            <div className="status-bar">
                <div className="status-left">
                    <div className={`connection-dot ${isConnected ? 'connected' : 'disconnected'}`}></div>
                    <span className="driver-name">{driver?.name || driverId}</span>
                    {driver && getSharedDriver(driverId) && (
                        <span className="sync-indicator">🔄 LIVE</span>
                    )}
                </div>
                <div className="status-right">
                    <button
                        className="info-toggle"
                        onClick={() => setShowInfo(!showInfo)}
                    >
                        ℹ️
                    </button>
                </div>
            </div>

            {/* Full-Screen Map */}
            <div className="full-screen-map">
                <MapContainer
                    center={driverPosition}
                    zoom={18}
                    style={{ height: '100%', width: '100%' }}
                    ref={mapRef}
                    zoomControl={false}
                    attributionControl={false}
                >
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; OpenStreetMap contributors'
                    />

                    {/* Driver tracking component */}
                    <DriverTracker driver={driver} bearing={currentBearing} navigationMode={navigationMode} />

                    {/* Driver Marker with Navigation-style Rotation */}
                    {(() => {
                        console.log(`🚗 Driver marker at:`, driverPosition, `moving: ${isMoving}, bearing: ${currentBearing}°, navigation: ${navigationMode}`);
                        return (
                            <Marker
                                position={driverPosition}
                                icon={createDriverArrow(currentBearing, isMoving, navigationMode)}
                            />
                        );
                    })()}

                    {/* Route Path */}
                    {driverRoute.length > 0 && (
                        <>
                            <Polyline
                                positions={driverRoute}
                                color="#4285F4"
                                weight={5}
                                opacity={0.8}
                                dashArray={isMoving ? undefined : "10, 10"}
                            />
                            {console.log(`🛣️ Rendering route with ${driverRoute.length} points:`, driverRoute.slice(0, 3), '...')}
                        </>
                    )}
                </MapContainer>
            </div>

            {/* Google Maps-like Bottom Panel */}
            <div className={`bottom-panel ${showInfo ? 'expanded' : 'collapsed'}`}>
                {showInfo ? (
                    <div className="driver-info">
                        <div className="info-header">
                            <h3>{driver?.name || driverId}</h3>
                            <button
                                className="close-btn"
                                onClick={() => setShowInfo(false)}
                            >
                                ×
                            </button>
                        </div>

                        <div className="info-grid">
                            <div className="info-item">
                                <span className="label">Status</span>
                                <span className={`value ${isMoving ? 'moving' : 'stopped'}`}>
                                    {isMoving ? '🚗 Moving' : '⏹️ Stopped'}
                                </span>
                            </div>

                            <div className="info-item">
                                <span className="label">Speed</span>
                                <span className="value">{speed} km/h</span>
                            </div>

                            <div className="info-item">
                                <span className="label">Simulation</span>
                                <span className={`value ${isSimulating ? 'active' : 'inactive'}`}>
                                    {isSimulating ? '🟢 Active' : '🔴 Inactive'}
                                </span>
                            </div>

                            <div className="info-item">
                                <span className="label">Route Points</span>
                                <span className="value">{driverRoute.length}</span>
                            </div>

                            <div className="info-item">
                                <span className="label">Deliveries</span>
                                <span className="value">{driver?.deliveries?.length || 0}</span>
                            </div>

                            <div className="info-item">
                                <span className="label">Position</span>
                                <span className="value">
                                    {driverPosition[0].toFixed(4)}, {driverPosition[1].toFixed(4)}
                                </span>
                            </div>
                        </div>

                        {driver?.deliveries && driver.deliveries.length > 0 && (
                            <div className="deliveries-list">
                                <h4>Active Deliveries</h4>
                                {driver.deliveries.slice(0, 3).map((delivery: any, index: number) => (
                                    <div key={delivery.id} className="delivery-card">
                                        <div className="delivery-header">
                                            <span className="delivery-number">#{index + 1}</span>
                                            <span className={`delivery-status ${delivery.status}`}>
                                                {delivery.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                        <p className="delivery-address">
                                            {delivery.delivery_address || 'Address not available'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="quick-status">
                        <div className="quick-info">
                            <span className={`status-badge ${isMoving ? 'moving' : 'stopped'}`}>
                                {isMoving ? '🚗 Moving' : '⏹️ Stopped'}
                            </span>
                            <span className="speed-display">{speed} km/h</span>
                        </div>
                        <div className="deliveries-count">
                            {driver?.deliveries?.length || 0} deliveries
                        </div>
                    </div>
                )}
            </div>

            {/* Google Maps-like Controls */}
            <div className="map-controls">
                <button
                    className="zoom-btn"
                    onClick={() => mapRef.current?.zoomIn()}
                >
                    +
                </button>
                <button
                    className="zoom-btn"
                    onClick={() => mapRef.current?.zoomOut()}
                >
                    -
                </button>
                <button
                    className={`nav-btn ${navigationMode ? 'active' : ''}`}
                    onClick={() => {
                        setNavigationMode(!navigationMode);
                        if (!navigationMode) {
                            // Reset map rotation when disabling navigation mode
                            const mapContainer = mapRef.current?.getContainer();
                            if (mapContainer) {
                                mapContainer.style.transform = 'rotate(0deg)';
                                mapContainer.style.transition = 'transform 0.5s ease-out';
                            }
                        }
                    }}
                    title={navigationMode ? 'Disable Navigation Mode' : 'Enable Navigation Mode'}
                >
                    🧭
                </button>
            </div>

            {/* Floating Speed Display */}
            {isMoving && (
                <div className="speed-overlay">
                    <div className="speed-value">{speed}</div>
                    <div className="speed-unit">km/h</div>
                </div>
            )}
        </div>
    );
};

export default DriverMobileView;
