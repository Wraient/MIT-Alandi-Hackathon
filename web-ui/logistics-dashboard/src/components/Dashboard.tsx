import React, { useState } from 'react';

interface Driver {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    deliveries: Delivery[];
    currentRoute?: [number, number][];
}

interface Delivery {
    id: string;
    pickup_latitude: number;
    pickup_longitude: number;
    delivery_latitude: number;
    delivery_longitude: number;
    status: 'pending' | 'picked_up' | 'delivered';
}

interface WeatherEvent {
    id: string;
    type: 'traffic' | 'storm';
    latitude: number;
    longitude: number;
    radius: number;
    active: boolean;
}

interface DashboardProps {
    drivers: Driver[];
    weatherEvents: WeatherEvent[];
    onAddDriver: () => void; // Changed: no longer needs name parameter
    onSimulateTraffic: () => void;
    onSimulateStorm: () => void;
    onAddDelivery: () => void;
    onToggleWeatherEvent: (eventId: string) => void;
    onSelectDriver: (driverId: string | null) => void;
    selectedDriver: string | null;
    placementMode: string;
    onCancelPlacement: () => void;
    isSimulating: boolean;
    simulationSpeed: number;
    onStartSimulation: () => void;
    onStopSimulation: () => void;
    onSpeedChange: (speed: number) => void;
    onAddRandomDriver: () => void;
    onAddRandomDelivery: () => void;
    isRecalculatingRoutes?: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({
    drivers,
    weatherEvents,
    onAddDriver,
    onSimulateTraffic,
    onSimulateStorm,
    onAddDelivery,
    onToggleWeatherEvent,
    onSelectDriver,
    selectedDriver,
    placementMode,
    onCancelPlacement,
    isSimulating,
    simulationSpeed,
    onStartSimulation,
    onStopSimulation,
    onSpeedChange,
    onAddRandomDriver,
    onAddRandomDelivery,
    isRecalculatingRoutes = false
}) => {
    const [showAddDriver, setShowAddDriver] = useState(false);
    // Removed manual name input - now uses random names

    const handleAddDriver = () => {
        onAddDriver(); // No name parameter needed
        setShowAddDriver(false);
    };

    return (
        <div className="h-full flex flex-col bg-white">
            <div className="p-4 border-b border-gray-200">
                <h1 className="text-2xl font-bold text-gray-900">Logistics Dashboard</h1>
                <p className="text-sm text-gray-600">Real-time delivery management</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Current Mode Indicator */}
                {placementMode !== 'none' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-sm font-medium text-blue-800">
                                    {placementMode === 'driver' && 'Click on map to place driver'}
                                    {placementMode === 'traffic' && 'Click on map to add traffic'}
                                    {placementMode === 'storm' && 'Click on map to add storm'}
                                    {placementMode === 'pickup' && 'Click on map to set pickup location'}
                                    {placementMode === 'delivery' && 'Click on map to set delivery location'}
                                </p>
                                <p className="text-xs text-blue-600">Mode: {placementMode}</p>
                            </div>
                            <button
                                onClick={onCancelPlacement}
                                className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Quick Actions */}
                <div className="space-y-3">
                    <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>

                    <button
                        onClick={() => setShowAddDriver(!showAddDriver)}
                        disabled={placementMode !== 'none'}
                        className={`w-full px-4 py-2 rounded transition-colors ${placementMode !== 'none'
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-blue-500 text-white hover:bg-blue-600'
                            }`}
                    >
                        Add Driver (Random Name)
                    </button>

                    {showAddDriver && placementMode === 'none' && (
                        <div className="bg-gray-50 p-3 rounded space-y-2">
                            <p className="text-sm text-gray-600">
                                Click on the map to place a driver with a randomly generated name.
                            </p>
                            <button
                                onClick={handleAddDriver}
                                className="w-full px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                            >
                                Click Map to Place Driver
                            </button>
                        </div>
                    )}

                    <button
                        onClick={onSimulateTraffic}
                        disabled={placementMode !== 'none'}
                        className={`w-full px-4 py-2 rounded transition-colors ${placementMode !== 'none'
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-orange-500 text-white hover:bg-orange-600'
                            }`}
                    >
                        Add Traffic (Click Map)
                    </button>

                    <button
                        onClick={onSimulateStorm}
                        disabled={placementMode !== 'none'}
                        className={`w-full px-4 py-2 rounded transition-colors ${placementMode !== 'none'
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-purple-500 text-white hover:bg-purple-600'
                            }`}
                    >
                        Add Storm (Click Map)
                    </button>

                    <button
                        onClick={onAddDelivery}
                        disabled={placementMode !== 'none'}
                        className={`w-full px-4 py-2 rounded transition-colors ${placementMode !== 'none'
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-green-500 text-white hover:bg-green-600'
                            }`}
                    >
                        Add Delivery (Click Map)
                    </button>

                    {/* Random Generation Buttons */}
                    <div className="border-t pt-3 mt-3">
                        <h3 className="text-sm font-medium text-gray-700 mb-2">Quick Generate</h3>
                        <div className="space-y-2">
                            <button
                                onClick={onAddRandomDriver}
                                disabled={placementMode !== 'none'}
                                className={`w-full px-4 py-2 rounded transition-colors ${placementMode !== 'none'
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-indigo-500 text-white hover:bg-indigo-600'
                                    }`}
                            >
                                🎲 Add Random Driver
                            </button>
                            
                            <button
                                onClick={onAddRandomDelivery}
                                disabled={placementMode !== 'none' || drivers.length === 0}
                                className={`w-full px-4 py-2 rounded transition-colors ${placementMode !== 'none' || drivers.length === 0
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-teal-500 text-white hover:bg-teal-600'
                                    }`}
                            >
                                🎯 Add Random Delivery
                            </button>
                            
                            {drivers.length === 0 && (
                                <p className="text-xs text-gray-500">
                                    Add drivers first to create random deliveries
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Simulation Controls */}
                <div className="space-y-3">
                    <h2 className="text-lg font-semibold text-gray-900">Simulation Controls</h2>

                    <div className="bg-gray-50 p-3 rounded space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-700">Status:</span>
                            <span className={`text-sm font-semibold ${isSimulating ? 'text-green-600' : 'text-red-600'}`}>
                                {isSimulating ? 'Running' : 'Stopped'}
                            </span>
                        </div>

                        {/* Dynamic Route Recalculation Status */}
                        {isRecalculatingRoutes && isSimulating && (
                            <div className="flex items-center space-x-2 text-blue-600 text-xs bg-blue-50 p-2 rounded">
                                <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-500"></div>
                                <span className="font-medium">Recalculating routes due to weather changes...</span>
                            </div>
                        )}

                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-medium text-gray-700">
                                    Speed: {simulationSpeed} km/h
                                </label>
                                {isSimulating && (
                                    <span className="text-xs text-green-600 font-medium">
                                        LIVE UPDATE
                                    </span>
                                )}
                            </div>
                            <input
                                type="range"
                                min="10"
                                max="500"
                                step="10"
                                value={simulationSpeed}
                                onChange={(e) => onSpeedChange(parseInt(e.target.value))}
                                className="w-full"
                            />
                            <div className="flex justify-between text-xs text-gray-500">
                                <span>10 km/h</span>
                                <span>250 km/h</span>
                                <span>500 km/h</span>
                            </div>
                            <div className="flex space-x-1">
                                <button
                                    onClick={() => onSpeedChange(50)}
                                    className="flex-1 px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                                >
                                    Normal (50)
                                </button>
                                <button
                                    onClick={() => onSpeedChange(100)}
                                    className="flex-1 px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                                >
                                    Fast (100)
                                </button>
                                <button
                                    onClick={() => onSpeedChange(250)}
                                    className="flex-1 px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                                >
                                    Super (250)
                                </button>
                                <button
                                    onClick={() => onSpeedChange(500)}
                                    className="flex-1 px-2 py-1 text-xs bg-red-200 hover:bg-red-300 rounded text-red-800"
                                >
                                    MAX (500)
                                </button>
                            </div>
                        </div>

                        <div className="flex space-x-2">
                            <button
                                onClick={onStartSimulation}
                                disabled={isSimulating || drivers.every(d => d.deliveries.length === 0)}
                                className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${isSimulating || drivers.every(d => d.deliveries.length === 0)
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-green-500 text-white hover:bg-green-600'
                                    }`}
                            >
                                Start Simulation
                            </button>

                            <button
                                onClick={onStopSimulation}
                                disabled={!isSimulating}
                                className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${!isSimulating
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-red-500 text-white hover:bg-red-600'
                                    }`}
                            >
                                Stop Simulation
                            </button>
                        </div>

                        {drivers.every(d => d.deliveries.length === 0) && (
                            <p className="text-xs text-gray-500">
                                Add deliveries to drivers to start simulation
                            </p>
                        )}
                    </div>
                </div>

                {/* Active Drivers */}
                <div className="space-y-3">
                    <h2 className="text-lg font-semibold text-gray-900">Active Drivers ({drivers.length})</h2>
                    <div className="space-y-2">
                        {drivers.map((driver) => {
                            const movingDriver = driver as any; // Type assertion for simulation properties
                            return (
                                <div
                                    key={driver.id}
                                    onClick={() => onSelectDriver(selectedDriver === driver.id ? null : driver.id)}
                                    className={`p-3 border rounded cursor-pointer transition-colors ${selectedDriver === driver.id
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center space-x-2">
                                                <h3 className="font-semibold text-gray-900">{driver.name}</h3>
                                                {movingDriver.isMoving && isSimulating && (
                                                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                                                        Moving
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-600">ID: {driver.id}</p>
                                            <p className="text-sm text-gray-600">
                                                Location: {driver.latitude.toFixed(4)}, {driver.longitude.toFixed(4)}
                                            </p>
                                            {movingDriver.isMoving && isSimulating && (
                                                <p className="text-xs text-blue-600">
                                                    → {movingDriver.currentTarget === 'pickup' ? 'Going to pickup' : 'Delivering'}
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-medium text-gray-900">
                                                {driver.deliveries.length} deliveries
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {driver.deliveries.filter(d => d.status === 'delivered').length} completed
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Weather Events */}
                <div className="space-y-3">
                    <h2 className="text-lg font-semibold text-gray-900">Weather Events ({weatherEvents.length})</h2>
                    <div className="space-y-2">
                        {weatherEvents.map((event) => (
                            <div
                                key={event.id}
                                className="p-3 border border-gray-200 rounded"
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-semibold text-gray-900 capitalize">{event.type}</h3>
                                        <p className="text-sm text-gray-600">ID: {event.id}</p>
                                        <p className="text-sm text-gray-600">Radius: {event.radius.toFixed(1)}km</p>
                                    </div>
                                    <button
                                        onClick={() => onToggleWeatherEvent(event.id)}
                                        className={`px-3 py-1 text-xs rounded ${event.active
                                            ? 'bg-red-500 text-white hover:bg-red-600'
                                            : 'bg-green-500 text-white hover:bg-green-600'
                                            }`}
                                    >
                                        {event.active ? 'Deactivate' : 'Activate'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Instructions */}
                <div className="bg-gray-50 p-3 rounded">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">How to Use:</h3>
                    <ul className="text-xs text-gray-600 space-y-1">
                        <li>• <strong>Add Driver:</strong> Click "Add Driver" → Click map (auto-generates random name)</li>
                        <li>• <strong>Quick Driver:</strong> Click "🎲 Add Random Driver" for instant placement</li>
                        <li>• <strong>Weather:</strong> Click "Add Traffic/Storm" → Click map to place event</li>
                        <li>• <strong>Manual Delivery:</strong> Click "Add Delivery" → Click pickup → Click delivery</li>
                        <li>• <strong>Smart Delivery:</strong> Click "🎯 Add Random Delivery" for connected routes &lt;50km</li>
                        <li>• <strong>Routes:</strong> Click driver card to view optimized route</li>
                        <li>• <strong>Simulation:</strong> Adjust speed (10-500 km/h) even while running</li>
                        <li>• <strong>Dynamic:</strong> Add weather during simulation to see live route changes</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
