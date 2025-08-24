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
  onAddDriver: (name: string) => void;
  onSimulateTraffic: () => void;
  onSimulateStorm: () => void;
  onAddDelivery: () => void;
  onToggleWeatherEvent: (eventId: string) => void;
  onSelectDriver: (driverId: string | null) => void;
  selectedDriver: string | null;
  placementMode: string;
  onCancelPlacement: () => void;
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
    onCancelPlacement
}) => {
    const [showAddDriver, setShowAddDriver] = useState(false);
    // Remove manual coordinate inputs - now using map-based placement
    const [newDriverName, setNewDriverName] = useState('');

    const handleAddDriver = () => {
        if (newDriverName.trim()) {
            onAddDriver(newDriverName.trim());
            setNewDriverName('');
            setShowAddDriver(false);
        }
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
                        className={`w-full px-4 py-2 rounded transition-colors ${
                            placementMode !== 'none' 
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-blue-500 text-white hover:bg-blue-600'
                        }`}
                    >
                        Add Driver
                    </button>

                    {showAddDriver && placementMode === 'none' && (
                        <div className="bg-gray-50 p-3 rounded space-y-2">
                            <input
                                type="text"
                                placeholder="Driver Name"
                                value={newDriverName}
                                onChange={(e) => setNewDriverName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
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
                        className={`w-full px-4 py-2 rounded transition-colors ${
                            placementMode !== 'none'
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-orange-500 text-white hover:bg-orange-600'
                        }`}
                    >
                        Add Traffic (Click Map)
                    </button>

                    <button
                        onClick={onSimulateStorm}
                        disabled={placementMode !== 'none'}
                        className={`w-full px-4 py-2 rounded transition-colors ${
                            placementMode !== 'none'
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-purple-500 text-white hover:bg-purple-600'
                        }`}
                    >
                        Add Storm (Click Map)
                    </button>

                    <button
                        onClick={onAddDelivery}
                        disabled={placementMode !== 'none'}
                        className={`w-full px-4 py-2 rounded transition-colors ${
                            placementMode !== 'none'
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-green-500 text-white hover:bg-green-600'
                        }`}
                    >
                        Add Delivery (Click Map)
                    </button>
                </div>

                {/* Active Drivers */}
                <div className="space-y-3">
                    <h2 className="text-lg font-semibold text-gray-900">Active Drivers ({drivers.length})</h2>
                    <div className="space-y-2">
                        {drivers.map((driver) => (
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
                                        <h3 className="font-semibold text-gray-900">{driver.name}</h3>
                                        <p className="text-sm text-gray-600">ID: {driver.id}</p>
                                        <p className="text-sm text-gray-600">
                                            Location: {driver.latitude.toFixed(4)}, {driver.longitude.toFixed(4)}
                                        </p>
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
                        ))}
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
                        <li>• Click "Add Driver" → Enter name → Click map to place</li>
                        <li>• Click "Add Traffic/Storm" → Click map to place event</li>
                        <li>• Click "Add Delivery" → Click pickup → Click delivery location</li>
                        <li>• Nearest driver will automatically get the new delivery</li>
                        <li>• Click driver card to view optimized route</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
