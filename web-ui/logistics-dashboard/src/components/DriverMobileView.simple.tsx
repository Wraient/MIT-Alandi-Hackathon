import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import { Icon } from 'leaflet';
import { useAppContext } from '../contexts/AppContext';
import ApiService, { Driver, Delivery } from '../services/api';
import 'leaflet/dist/leaflet.css';
import '../mobile.css';

// Extended driver interface for simulation data
interface ExtendedDriver extends Driver {
    isMoving?: boolean;
    simulationPosition?: [number, number];
    deliveries?: Delivery[];
    currentRoute?: [number, number][];
    activeRoute?: [number, number][];
    heading?: number;
    speed?: number;
    [key: string]: any; // Allow additional properties
}

// Map events handler component
const MapEventHandler: React.FC<{ onMapInteraction: () => void }> = ({ onMapInteraction }) => {
    useMapEvents({
        movestart: onMapInteraction,
        zoomstart: onMapInteraction,
        dragstart: onMapInteraction,
    });
    return null;
};

const DriverMobileView: React.FC = () => {
    // Parse URL parameters
    const urlParams = Object.fromEntries(new URLSearchParams(window.location.search));
    const driverId = urlParams.driver || 'D001';

    // App context for shared driver data
    const { getSharedDriver } = useAppContext();

    // Simple state for data display
    const [driver, setDriver] = useState<ExtendedDriver | null>(null);
    const [availableDrivers, setAvailableDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [autoCenter, setAutoCenter] = useState(false);
    const [userInteracted, setUserInteracted] = useState(false);

    const mapRef = useRef<any>(null);

    // Custom driver icon
    const driverIcon = new Icon({
        iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iMzAiIHZpZXdCb3g9IjAgMCAzMCAzMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTUiIGN5PSIxNSIgcj0iMTUiIGZpbGw9IiMxMEI5ODEiLz4KPGJ0ZXh0IHg9IjE1IiB5PSIyMCIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iMTQiIGZvbnQtd2VpZ2h0PSJib2xkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5EPC90ZXh0Pgo8L3N2Zz4K',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15]
    });

    // Simple functions to get driver data from shared context
    const loadAvailableDrivers = async () => {
        try {
            const drivers = await ApiService.getDrivers();
            setAvailableDrivers(drivers);
        } catch (error: any) {
            console.error('Error loading drivers:', error);
            setError('Failed to load drivers');
        }
    };

    // Get real-time driver data from web UI
    useEffect(() => {
        if (!driverId) return;

        const interval = setInterval(() => {
            const sharedDriver = getSharedDriver(driverId);
            if (sharedDriver) {
                setDriver(sharedDriver as ExtendedDriver);
                setIsConnected(true);
                setError(null);
            } else {
                // Fallback: try to get driver data from API
                ApiService.getDrivers().then((drivers: Driver[]) => {
                    const foundDriver = drivers.find((d: Driver) => d.id === driverId);
                    if (foundDriver) {
                        setDriver(foundDriver as ExtendedDriver);
                        setIsConnected(true);
                    } else {
                        setIsConnected(false);
                    }
                }).catch((error: any) => {
                    console.error('Error fetching driver:', error);
                    setIsConnected(false);
                });
            }
        }, 100); // Check every 100ms for real-time updates

        return () => clearInterval(interval);
    }, [driverId, getSharedDriver]);

    // Auto-center map on driver position only when explicitly enabled and user hasn't interacted
    useEffect(() => {
        if (autoCenter && driver?.simulationPosition && mapRef.current && !userInteracted) {
            mapRef.current.setView(driver.simulationPosition, 16);
        }
    }, [driver?.simulationPosition, autoCenter, userInteracted]);

    // Handle manual recenter
    const handleRecenter = () => {
        if (driver?.simulationPosition && mapRef.current) {
            mapRef.current.setView(driver.simulationPosition, 16);
            setUserInteracted(false); // Reset user interaction flag
            setAutoCenter(true); // Enable auto-center
        }
    };

    // Handle map interaction events
    const handleMapInteraction = () => {
        if (autoCenter) {
            setUserInteracted(true); // Mark that user has interacted
            setAutoCenter(false); // Disable auto-center
        }
    };

    // Load available drivers on mount
    useEffect(() => {
        loadAvailableDrivers();
        setLoading(false);
    }, []);

    // Get driver position
    const getDriverPosition = (): [number, number] => {
        if (driver?.simulationPosition) {
            return driver.simulationPosition;
        }
        return driver ? [driver.latitude, driver.longitude] : [18.5204, 73.8567];
    };

    // Get driver route
    const getDriverRoute = () => {
        return driver?.currentRoute || [];
    };

    if (loading) {
        return (
            <div className="driver-mobile-view">
                <div className="mobile-header">
                    <h1>Driver View - Loading...</h1>
                </div>
                <div className="mobile-loading">Loading driver data...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="driver-mobile-view">
                <div className="mobile-header">
                    <h1>Driver View - Error</h1>
                </div>
                <div className="mobile-error">{error}</div>
            </div>
        );
    }

    const driverPosition = getDriverPosition();
    const driverRoute = getDriverRoute();

    return (
        <div className="driver-mobile-view">
            {/* Mobile Header */}
            <div className="mobile-header">
                <h1>Driver: {driver?.name || driverId}</h1>
                <div className="status-indicator">
                    <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
                    <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                </div>
            </div>

            {/* Map Container */}
            <div className="mobile-map-container">
                <MapContainer
                    center={driverPosition}
                    zoom={16}
                    style={{ height: '60vh', width: '100%' }}
                    ref={mapRef}
                >
                    <MapEventHandler onMapInteraction={handleMapInteraction} />
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />

                    {/* Driver Marker */}
                    {driver && (
                        <Marker position={driverPosition} icon={driverIcon}>
                            <Popup>
                                <div>
                                    <h3>{driver.name}</h3>
                                    <p>ID: {driver.id}</p>
                                    <p>Status: {driver.status}</p>
                                    {driver.isMoving && <p>🚗 Moving</p>}
                                </div>
                            </Popup>
                        </Marker>
                    )}

                    {/* Route Path */}
                    {driverRoute.length > 0 && (
                        <Polyline
                            positions={driverRoute}
                            color="#3B82F6"
                            weight={4}
                            opacity={0.7}
                        />
                    )}
                </MapContainer>
            </div>

            {/* Driver Info Panel */}
            <div className="mobile-info-panel">
                {driver ? (
                    <>
                        <div className="info-section">
                            <h3>Current Status</h3>
                            <p><strong>Name:</strong> {driver.name}</p>
                            <p><strong>ID:</strong> {driver.id}</p>
                            <p><strong>Status:</strong> {driver.status}</p>
                            <p><strong>Moving:</strong> {driver.isMoving ? 'Yes' : 'No'}</p>
                        </div>

                        <div className="info-section">
                            <h3>Location</h3>
                            <p><strong>Position:</strong> {driverPosition[0].toFixed(4)}, {driverPosition[1].toFixed(4)}</p>
                            {driver.simulationPosition && (
                                <p><strong>Simulation Active:</strong> Yes</p>
                            )}
                        </div>

                        <div className="info-section">
                            <h3>Deliveries</h3>
                            <p><strong>Total:</strong> {driver.deliveries?.length || 0}</p>
                            {driver.deliveries?.map((delivery: any, index: number) => (
                                <div key={delivery.id} className="delivery-item">
                                    <p><strong>#{index + 1}:</strong> {delivery.status}</p>
                                </div>
                            ))}
                        </div>

                        <div className="controls-section">
                            <button
                                onClick={handleRecenter}
                                className="mobile-btn recenter-btn"
                                disabled={!driver?.simulationPosition}
                            >
                                📍 Recenter on Driver
                            </button>
                            <div className="auto-center-status">
                                {autoCenter && !userInteracted ? (
                                    <span className="status-text">� Auto-following</span>
                                ) : (
                                    <span className="status-text">⭕ Manual control</span>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="info-section">
                        <p>No driver data available</p>
                        <p>Available drivers: {availableDrivers.map(d => d.id).join(', ')}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DriverMobileView;
