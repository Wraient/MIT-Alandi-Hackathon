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
    onAddDriver: (driver: Omit<Driver, 'id' | 'deliveries'>) => void;
    onAddWeatherEvent: (event: Omit<WeatherEvent, 'id'>) => void;
    onToggleWeatherEvent: (eventId: string) => void;
    onSelectDriver: (driverId: string | null) => void;
    selectedDriver: string | null;
}

const Dashboard: React.FC<DashboardProps> = ({
    drivers,
    weatherEvents,
    onAddDriver,
    onAddWeatherEvent,
    onToggleWeatherEvent,
    onSelectDriver,
    selectedDriver
}) => {
    const [showAddDriver, setShowAddDriver] = useState(false);
    const [newDriverName, setNewDriverName] = useState('');
    const [newDriverLat, setNewDriverLat] = useState('19.0760');
    const [newDriverLng, setNewDriverLng] = useState('72.8777');

    const handleAddDriver = () => {
        if (newDriverName.trim()) {
            onAddDriver({
                name: newDriverName.trim(),
                latitude: parseFloat(newDriverLat),
                longitude: parseFloat(newDriverLng)
            });
            setNewDriverName('');
            setNewDriverLat('19.0760');
            setNewDriverLng('72.8777');
            setShowAddDriver(false);
        }
    };

    const simulateTraffic = () => {
        onAddWeatherEvent({
            type: 'traffic',
            latitude: 19.0760 + (Math.random() - 0.5) * 0.1,
            longitude: 72.8777 + (Math.random() - 0.5) * 0.1,
            radius: Math.random() * 5 + 2,
            active: true
        });
    };

    const simulateStorm = () => {
        onAddWeatherEvent({
            type: 'storm',
            latitude: 19.0760 + (Math.random() - 0.5) * 0.1,
            longitude: 72.8777 + (Math.random() - 0.5) * 0.1,
            radius: Math.random() * 10 + 5,
            active: true
        });
    };

    return (
        <div className="h-full flex flex-col bg-white">
            <div className="p-4 border-b border-gray-200">
                <h1 className="text-2xl font-bold text-gray-900">Logistics Dashboard</h1>
                <p className="text-sm text-gray-600">Real-time delivery management</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Quick Actions */}
                <div className="space-y-3">
                    <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>

                    <button
                        onClick={() => setShowAddDriver(!showAddDriver)}
                        className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    >
                        Add Driver
                    </button>

                    {showAddDriver && (
                        <div className="bg-gray-50 p-3 rounded space-y-2">
                            <input
                                type="text"
                                placeholder="Driver Name"
                                value={newDriverName}
                                onChange={(e) => setNewDriverName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <div className="flex space-x-2">
                                <input
                                    type="text"
                                    placeholder="Latitude"
                                    value={newDriverLat}
                                    onChange={(e) => setNewDriverLat(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <input
                                    type="text"
                                    placeholder="Longitude"
                                    value={newDriverLng}
                                    onChange={(e) => setNewDriverLng(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <button
                                onClick={handleAddDriver}
                                className="w-full px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                            >
                                Add Driver
                            </button>
                        </div>
                    )}

                    <button
                        onClick={simulateTraffic}
                        className="w-full px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
                    >
                        Simulate Traffic
                    </button>

                    <button
                        onClick={simulateStorm}
                        className="w-full px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
                    >
                        Simulate Storm
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
            </div>
        </div>
    );
};

export default Dashboard;
