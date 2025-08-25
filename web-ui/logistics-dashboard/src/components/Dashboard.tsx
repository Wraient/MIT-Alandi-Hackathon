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
    onClearAll: () => void;
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
    isRecalculatingRoutes = false,
    onClearAll
}) => {
    const [showAddDriver, setShowAddDriver] = useState(false);
    // Removed manual name input - now uses random names

    const handleAddDriver = () => {
        onAddDriver(); // No name parameter needed
        setShowAddDriver(false);
    };

    return (
        <div className="h-full flex flex-col bg-gray-800">
            <div className="p-4 border-b border-gray-700">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-100">Logistics Dashboard</h1>
                        <p className="text-sm text-gray-300">Real-time delivery management</p>
                    </div>
                    <div className="flex space-x-2">
                        <a
                            href="/driver"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white text-sm rounded-lg font-semibold shadow-md hover:from-green-700 hover:to-green-800 hover:shadow-lg transform hover:scale-105 transition-all duration-200 border border-green-500"
                        >
                            📱 Mobile Driver View
                        </a>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-800">
                {/* Current Mode Indicator */}
                {placementMode !== 'none' && (
                    <div className="bg-blue-900/50 border border-blue-600 rounded-lg p-3">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-sm font-medium text-blue-200">
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
                                className="px-3 py-2 text-xs bg-gradient-to-r from-red-500 to-red-600 text-black rounded-lg shadow-md hover:from-red-600 hover:to-red-700 hover:shadow-lg transform hover:scale-105 transition-all duration-200"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Quick Actions */}
                <div className="space-y-3">
                    <h2 className="text-lg font-semibold text-gray-100">Quick Actions</h2>

                    <button
                        onClick={() => setShowAddDriver(!showAddDriver)}
                        disabled={placementMode !== 'none'}
                        className={`w-full px-6 py-3 rounded-xl font-semibold shadow-lg transition-all duration-300 transform border ${placementMode !== 'none'
                            ? 'bg-gradient-to-r from-gray-600 to-gray-700 text-black cursor-not-allowed border-gray-600'
                            : 'bg-gradient-to-r from-blue-600 to-blue-700 text-black hover:from-blue-700 hover:to-blue-800 hover:shadow-xl hover:scale-105 border-blue-500'
                            }`}
                    >
                        Add Driver (Random Name)
                    </button>

                    {showAddDriver && placementMode === 'none' && (
                        <div className="bg-gray-700 border border-gray-600 p-3 rounded space-y-2">
                            <p className="text-sm text-gray-300">
                                Click on the map to place a driver with a randomly generated name.
                            </p>
                            <button
                                onClick={handleAddDriver}
                                className="w-full px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 text-black rounded-xl font-semibold shadow-lg hover:from-green-700 hover:to-green-800 hover:shadow-xl transform hover:scale-105 transition-all duration-300 border border-green-500"
                            >
                                Click Map to Place Driver
                            </button>
                        </div>
                    )}

                    <button
                        onClick={onSimulateTraffic}
                        disabled={placementMode !== 'none'}
                        className={`w-full px-6 py-3 rounded-xl font-semibold shadow-lg transition-all duration-300 transform border ${placementMode !== 'none'
                            ? 'bg-gradient-to-r from-gray-600 to-gray-700 text-black cursor-not-allowed border-gray-600'
                            : 'bg-gradient-to-r from-orange-600 to-orange-700 text-black hover:from-orange-700 hover:to-orange-800 hover:shadow-xl hover:scale-105 border-orange-500'
                            }`}
                    >
                        Add Traffic (Click Map)
                    </button>

                    <button
                        onClick={onSimulateStorm}
                        disabled={placementMode !== 'none'}
                        className={`w-full px-6 py-3 rounded-xl font-semibold shadow-lg transition-all duration-300 transform border ${placementMode !== 'none'
                            ? 'bg-gradient-to-r from-gray-600 to-gray-700 text-black cursor-not-allowed border-gray-600'
                            : 'bg-gradient-to-r from-purple-600 to-purple-700 text-black hover:from-purple-700 hover:to-purple-800 hover:shadow-xl hover:scale-105 border-purple-500'
                            }`}
                    >
                        Add Storm (Click Map)
                    </button>

                    <button
                        onClick={onAddDelivery}
                        disabled={placementMode !== 'none'}
                        className={`w-full px-6 py-3 rounded-xl font-semibold shadow-lg transition-all duration-300 transform border ${placementMode !== 'none'
                            ? 'bg-gradient-to-r from-gray-600 to-gray-700 text-black cursor-not-allowed border-gray-600'
                            : 'bg-gradient-to-r from-green-600 to-green-700 text-black hover:from-green-700 hover:to-green-800 hover:shadow-xl hover:scale-105 border-green-500'
                            }`}
                    >
                        Add Delivery (Click Map)
                    </button>

                    {/* Random Generation Buttons */}
                    <div className="border-t border-gray-600 pt-3 mt-3">
                        <h3 className="text-sm font-medium text-gray-300 mb-2">Quick Generate</h3>
                        <div className="space-y-2">
                            <button
                                onClick={onAddRandomDriver}
                                disabled={placementMode !== 'none'}
                                className={`w-full px-6 py-3 rounded-xl font-semibold shadow-lg transition-all duration-300 transform border ${placementMode !== 'none'
                                    ? 'bg-gradient-to-r from-gray-600 to-gray-700 text-black cursor-not-allowed border-gray-600'
                                    : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-black hover:from-indigo-700 hover:to-indigo-800 hover:shadow-xl hover:scale-105 border-indigo-500'
                                    }`}
                            >
                                🎲 Add Random Driver
                            </button>

                            <button
                                onClick={onAddRandomDelivery}
                                disabled={placementMode !== 'none' || drivers.length === 0}
                                className={`w-full px-6 py-3 rounded-xl font-semibold shadow-lg transition-all duration-300 transform border ${placementMode !== 'none' || drivers.length === 0
                                    ? 'bg-gradient-to-r from-gray-600 to-gray-700 text-black cursor-not-allowed border-gray-600'
                                    : 'bg-gradient-to-r from-teal-600 to-teal-700 text-black hover:from-teal-700 hover:to-teal-800 hover:shadow-xl hover:scale-105 border-teal-500'
                                    }`}
                            >
                                🎯 Add Random Delivery
                            </button>

                            {drivers.length === 0 && (
                                <p className="text-xs text-gray-400">
                                    Add drivers first to create random deliveries
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Clear All Button */}
                <div className="space-y-3">
                    <button
                        onClick={() => {
                            if (window.confirm('Are you sure you want to clear everything from the map? This will remove all drivers, deliveries, and weather events.')) {
                                onClearAll();
                            }
                        }}
                        className="w-full px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-black rounded-xl font-semibold shadow-lg hover:from-red-700 hover:to-red-800 hover:shadow-xl transform hover:scale-105 transition-all duration-300 border border-red-500"
                    >
                        🗑️ Clear All
                    </button>
                    <p className="text-xs text-gray-400 text-center">
                        Remove all drivers, deliveries, and weather events
                    </p>
                </div>

                {/* Simulation Controls */}
                <div className="space-y-3">
                    <h2 className="text-lg font-semibold text-gray-100">Simulation Controls</h2>

                    <div className="bg-gray-700 border border-gray-600 p-3 rounded-lg space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-300">Status:</span>
                            <span className={`text-sm font-semibold ${isSimulating ? 'text-green-400' : 'text-red-400'}`}>
                                {isSimulating ? 'Running' : 'Stopped'}
                            </span>
                        </div>

                        {/* Dynamic Route Recalculation Status */}
                        {isRecalculatingRoutes && isSimulating && (
                            <div className="flex items-center space-x-2 text-blue-300 text-xs bg-blue-900/50 border border-blue-600 p-2 rounded">
                                <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-400"></div>
                                <span className="font-medium">Recalculating routes due to weather changes...</span>
                            </div>
                        )}

                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-medium text-gray-300">
                                    Speed: {simulationSpeed} km/h
                                </label>
                                {isSimulating && (
                                    <span className="text-xs text-green-400 font-medium">
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
                            <div className="flex justify-between text-xs text-gray-400">
                                <span>10 km/h</span>
                                <span>250 km/h</span>
                                <span>500 km/h</span>
                            </div>
                            <div className="flex space-x-2">
                                <button
                                    onClick={() => onSpeedChange(50)}
                                    className="flex-1 px-3 py-2 text-xs bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 rounded-lg font-medium shadow-sm transform hover:scale-105 transition-all duration-200 text-black border border-gray-500"
                                >
                                    Normal (50)
                                </button>
                                <button
                                    onClick={() => onSpeedChange(250)}
                                    className="flex-1 px-3 py-2 text-xs bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-lg font-medium shadow-sm transform hover:scale-105 transition-all duration-200 text-black border border-blue-500"
                                >
                                    Fast (250)
                                </button>
                                <button
                                    onClick={() => onSpeedChange(500)}
                                    className="flex-1 px-3 py-2 text-xs bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 rounded-lg font-medium shadow-sm transform hover:scale-105 transition-all duration-200 text-black border border-yellow-500"
                                >
                                    Super (500)
                                </button>
                                <button
                                    onClick={() => onSpeedChange(2000)}
                                    className="flex-1 px-3 py-2 text-xs bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 rounded-lg font-medium shadow-sm text-black transform hover:scale-105 transition-all duration-200 border border-red-500"
                                >
                                    MAX (2000)
                                </button>
                            </div>
                        </div>

                        <div className="flex space-x-3">
                            <button
                                onClick={onStartSimulation}
                                disabled={isSimulating || drivers.every(d => d.deliveries.length === 0)}
                                className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold shadow-lg transition-all duration-300 transform border ${isSimulating || drivers.every(d => d.deliveries.length === 0)
                                    ? 'bg-gradient-to-r from-gray-600 to-gray-700 text-black cursor-not-allowed border-gray-600'
                                    : 'bg-gradient-to-r from-green-600 to-green-700 text-black hover:from-green-700 hover:to-green-800 hover:shadow-xl hover:scale-105 border-green-500'
                                    }`}
                            >
                                Start Simulation
                            </button>

                            <button
                                onClick={onStopSimulation}
                                disabled={!isSimulating}
                                className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold shadow-lg transition-all duration-300 transform border ${!isSimulating
                                    ? 'bg-gradient-to-r from-gray-600 to-gray-700 text-black cursor-not-allowed border-gray-600'
                                    : 'bg-gradient-to-r from-red-600 to-red-700 text-black hover:from-red-700 hover:to-red-800 hover:shadow-xl hover:scale-105 border-red-500'
                                    }`}
                            >
                                Stop Simulation
                            </button>
                        </div>

                        {drivers.every(d => d.deliveries.length === 0) && (
                            <p className="text-xs text-gray-400">
                                Add deliveries to drivers to start simulation
                            </p>
                        )}
                    </div>
                </div>

                {/* Active Drivers */}
                <div className="space-y-3">
                    <h2 className="text-lg font-semibold text-gray-100">Active Drivers ({drivers.length})</h2>
                    <div className="space-y-2">
                        {drivers.map((driver) => {
                            const movingDriver = driver as any; // Type assertion for simulation properties
                            return (
                                <div
                                    key={driver.id}
                                    onClick={() => onSelectDriver(selectedDriver === driver.id ? null : driver.id)}
                                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedDriver === driver.id
                                        ? 'border-blue-500 bg-blue-900/30'
                                        : 'border-gray-600 hover:border-gray-500 bg-gray-700/50'
                                        }`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center space-x-2">
                                                <h3 className="font-semibold text-gray-100">{driver.name}</h3>
                                                {movingDriver.isMoving && isSimulating && (
                                                    <span className="px-2 py-1 text-xs bg-green-900/50 text-green-300 rounded border border-green-700">
                                                        Moving
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-300">ID: {driver.id}</p>
                                            <p className="text-sm text-gray-300">
                                                Location: {driver.latitude.toFixed(4)}, {driver.longitude.toFixed(4)}
                                            </p>
                                            {movingDriver.isMoving && isSimulating && (
                                                <p className="text-xs text-blue-300">
                                                    → {movingDriver.currentTarget === 'pickup' ? 'Going to pickup' : 'Delivering'}
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-medium text-gray-100">
                                                {driver.deliveries.length} deliveries
                                            </div>
                                            <div className="text-xs text-gray-400">
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
                    <h2 className="text-lg font-semibold text-gray-100">Weather Events ({weatherEvents.length})</h2>
                    <div className="space-y-2">
                        {weatherEvents.map((event) => (
                            <div
                                key={event.id}
                                className="p-3 border border-gray-600 rounded-lg bg-gray-700/50"
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-semibold text-gray-100 capitalize">{event.type}</h3>
                                        <p className="text-sm text-gray-300">ID: {event.id}</p>
                                        <p className="text-sm text-gray-300">Radius: {event.radius.toFixed(1)}km</p>
                                    </div>
                                    <button
                                        onClick={() => onToggleWeatherEvent(event.id)}
                                        className={`px-4 py-2 text-xs rounded-lg font-semibold shadow-md transition-all duration-300 transform hover:scale-105 border ${event.active
                                            ? 'bg-gradient-to-r from-red-600 to-red-700 text-black hover:from-red-700 hover:to-red-800 hover:shadow-lg border-red-500'
                                            : 'bg-gradient-to-r from-green-600 to-green-700 text-black hover:from-green-700 hover:to-green-800 hover:shadow-lg border-green-500'
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
                <div className="bg-gray-700 border border-gray-600 p-3 rounded-lg">
                    <h3 className="text-sm font-semibold text-gray-100 mb-2">How to Use:</h3>
                    <ul className="text-xs text-gray-300 space-y-1">
                        <li>• <strong className="text-gray-100">Add Driver:</strong> Click "Add Driver" → Click map (auto-generates random name)</li>
                        <li>• <strong className="text-gray-100">Quick Driver:</strong> Click "🎲 Add Random Driver" for instant placement</li>
                        <li>• <strong className="text-gray-100">Weather:</strong> Click "Add Traffic/Storm" → Click map to place event</li>
                        <li>• <strong className="text-gray-100">Manual Delivery:</strong> Click "Add Delivery" → Click pickup → Click delivery</li>
                        <li>• <strong className="text-gray-100">Smart Delivery:</strong> Click "🎯 Add Random Delivery" for connected routes &lt;50km</li>
                        <li>• <strong className="text-gray-100">Routes:</strong> Click driver card to view optimized route</li>
                        <li>• <strong className="text-gray-100">Simulation:</strong> Adjust speed (10-500 km/h) even while running</li>
                        <li>• <strong className="text-gray-100">Dynamic:</strong> Add weather during simulation to see live route changes</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
