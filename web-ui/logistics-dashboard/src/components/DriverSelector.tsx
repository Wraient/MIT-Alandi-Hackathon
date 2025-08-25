import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ApiService, { Driver, Delivery } from '../services/api';
import { useAppContext } from '../contexts/AppContext';
import '../mobile.css';

interface ExtendedDriver extends Driver {
    deliveries?: Delivery[];
    isMoving?: boolean;
    currentTarget?: 'pickup' | 'delivery';
    simulationPosition?: [number, number];
    isWorking?: boolean;
}

const DriverSelector: React.FC = () => {
    const [drivers, setDrivers] = useState<ExtendedDriver[]>([]);
    const [selectedDriver, setSelectedDriver] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const { appState } = useAppContext();

    // Check if a driver is currently working
    const isDriverWorking = (driver: ExtendedDriver): boolean => {
        // Check if driver is actively moving in simulation
        if (driver.isMoving && driver.currentTarget) {
            return true;
        }

        // Check if driver has active deliveries (pending or picked up)
        const hasActiveDeliveries = driver.deliveries && driver.deliveries.some(
            delivery => delivery.status === 'pending' || delivery.status === 'picked_up'
        );

        if (hasActiveDeliveries) {
            return true;
        }

        return false;
    };

    // Load available drivers and their deliveries
    useEffect(() => {
        const fetchDrivers = async () => {
            try {
                const [driversData, deliveriesData] = await Promise.all([
                    ApiService.getDrivers(),
                    ApiService.getDeliveries()
                ]);

                // Associate deliveries with drivers and check shared state
                const driversWithDeliveries = driversData.map((driver: Driver) => {
                    const driverDeliveries = deliveriesData.filter(
                        (delivery: Delivery) => delivery.driver_id === driver.id
                    );

                    // Get shared driver state if available
                    const sharedDriver = appState.sharedDrivers[driver.id];

                    const extendedDriver: ExtendedDriver = {
                        ...driver,
                        deliveries: driverDeliveries,
                        isMoving: sharedDriver?.isMoving || false,
                        currentTarget: sharedDriver?.currentTarget,
                        simulationPosition: sharedDriver?.simulationPosition,
                    };

                    // Mark as working if meets criteria
                    extendedDriver.isWorking = isDriverWorking(extendedDriver);

                    return extendedDriver;
                });

                // Filter to only show working drivers
                const workingDrivers = driversWithDeliveries.filter(driver => driver.isWorking);

                setDrivers(workingDrivers);
                setError(null);

                // If no working drivers, show helpful message
                if (workingDrivers.length === 0) {
                    setError('No drivers are currently working. Please start simulation from the main dashboard first.');
                }

            } catch (err: any) {
                console.error('Error fetching drivers:', err);
                setError('Failed to load drivers');
            } finally {
                setLoading(false);
            }
        };

        fetchDrivers();

        // Refresh every 2 seconds to get updated driver states
        const interval = setInterval(fetchDrivers, 2000);
        return () => clearInterval(interval);
    }, [appState.sharedDrivers]);

    const handleDriverSelect = (driverId: string) => {
        setSelectedDriver(driverId);
    };

    const handleViewMobile = () => {
        if (selectedDriver) {
            // Navigate to mobile view with selected driver
            navigate(`/driver/mobile?driver=${selectedDriver}`);
        }
    };

    const handleBackToDashboard = () => {
        navigate('/');
    };

    if (loading) {
        return (
            <div className="driver-selector-container">
                <div className="selector-content">
                    <div className="loading-spinner"></div>
                    <p>Loading drivers...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="driver-selector-container">
            <div className="selector-content">
                {/* Header */}
                <div className="selector-header">
                    <h1>Working Drivers</h1>
                    <p>Choose from drivers currently handling deliveries</p>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="error-message">
                        <span>ℹ️</span>
                        <div>
                            <p>{error}</p>
                            {error.includes('No drivers are currently working') && (
                                <p className="error-help">
                                    Go to the main dashboard, add drivers and deliveries, then start simulation.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Driver Selection */}
                <div className="driver-selection">
                    <label htmlFor="driver-select">Working Drivers:</label>
                    <select
                        id="driver-select"
                        value={selectedDriver}
                        onChange={(e) => handleDriverSelect(e.target.value)}
                        className="driver-dropdown"
                        disabled={drivers.length === 0}
                    >
                        <option value="">
                            {drivers.length === 0 ? 'No working drivers available' : 'Select a working driver...'}
                        </option>
                        {drivers.map((driver) => {
                            const status = driver.isMoving ?
                                `Moving to ${driver.currentTarget === 'pickup' ? 'pickup' : 'delivery'}` :
                                `${driver.deliveries?.filter(d => d.status === 'pending').length || 0} pending, ${driver.deliveries?.filter(d => d.status === 'picked_up').length || 0} picked up`;

                            return (
                                <option key={driver.id} value={driver.id}>
                                    {driver.name} ({driver.id}) - {status}
                                </option>
                            );
                        })}
                    </select>
                </div>

                {/* Driver Preview */}
                {selectedDriver && (
                    <div className="driver-preview">
                        {(() => {
                            const driver = drivers.find(d => d.id === selectedDriver);
                            if (!driver) return null;

                            const pendingDeliveries = driver.deliveries?.filter(d => d.status === 'pending').length || 0;
                            const pickedUpDeliveries = driver.deliveries?.filter(d => d.status === 'picked_up').length || 0;
                            const completedDeliveries = driver.deliveries?.filter(d => d.status === 'delivered').length || 0;

                            return (
                                <>
                                    <h3>Driver Status</h3>
                                    <div className="driver-info">
                                        <p><strong>Name:</strong> {driver.name}</p>
                                        <p><strong>ID:</strong> {driver.id}</p>
                                        <p><strong>Current Status:</strong>
                                            {driver.isMoving ? (
                                                <span className="status-moving">
                                                    Moving to {driver.currentTarget === 'pickup' ? 'pickup' : 'delivery'} 🚗
                                                </span>
                                            ) : (
                                                <span className="status-ready">Ready/Working 📋</span>
                                            )}
                                        </p>
                                        <p><strong>Location:</strong> {
                                            driver.simulationPosition ?
                                                `${driver.simulationPosition[0].toFixed(4)}, ${driver.simulationPosition[1].toFixed(4)} (Live)` :
                                                `${driver.latitude.toFixed(4)}, ${driver.longitude.toFixed(4)}`
                                        }</p>
                                        <p><strong>Deliveries:</strong></p>
                                        <div className="delivery-stats">
                                            <span className="stat pending">📦 {pendingDeliveries} Pending</span>
                                            <span className="stat picked-up">🚚 {pickedUpDeliveries} Picked Up</span>
                                            <span className="stat completed">✅ {completedDeliveries} Completed</span>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                )}

                {/* Action Buttons */}
                <div className="action-buttons">
                    <button
                        onClick={handleBackToDashboard}
                        className="btn btn-secondary"
                    >
                        ← Back to Dashboard
                    </button>

                    <button
                        onClick={handleViewMobile}
                        disabled={!selectedDriver}
                        className="btn btn-primary"
                    >
                        View Mobile Interface →
                    </button>
                </div>

                {/* Instructions */}
                <div className="instructions">
                    <h4>Instructions:</h4>
                    <ul>
                        <li>Only working drivers are shown (those with active deliveries or currently moving)</li>
                        <li>Start simulation from the main dashboard to see drivers here</li>
                        <li>Select a driver from the dropdown to view their mobile interface</li>
                        <li>The mobile view shows real-time driver perspective and navigation</li>
                        <li>Data updates automatically every 2 seconds</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default DriverSelector;
