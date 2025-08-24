import React from 'react';

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

interface MetricsPanelProps {
    drivers: Driver[];
    weatherEvents: WeatherEvent[];
}

const MetricsPanel: React.FC<MetricsPanelProps> = ({ drivers, weatherEvents }) => {
    // Calculate metrics
    const totalDeliveries = drivers.reduce((sum, driver) => sum + driver.deliveries.length, 0);
    const completedDeliveries = drivers.reduce(
        (sum, driver) => sum + driver.deliveries.filter(d => d.status === 'delivered').length,
        0
    );
    const pendingDeliveries = totalDeliveries - completedDeliveries;
    const activeEvents = weatherEvents.filter(e => e.active).length;

    // Mock data for demo
    const timeSavedMinutes = Math.floor(Math.random() * 60) + 15;
    const decisionLatencyMs = Math.floor(Math.random() * 500) + 200;
    const reroutedDeliveries = Math.floor(Math.random() * 5);

    const completionRate = totalDeliveries > 0 ? (completedDeliveries / totalDeliveries * 100) : 0;

    return (
        <div className="bg-white rounded-lg shadow-lg p-4 space-y-4">
            <div className="border-b border-gray-200 pb-2">
                <h2 className="text-lg font-semibold text-gray-900">System Metrics</h2>
                <p className="text-sm text-gray-600">Real-time performance dashboard</p>
            </div>

            {/* Key Performance Indicators */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 p-3 rounded">
                    <div className="text-2xl font-bold text-blue-600">{drivers.length}</div>
                    <div className="text-sm text-gray-600">Active Drivers</div>
                </div>

                <div className="bg-green-50 p-3 rounded">
                    <div className="text-2xl font-bold text-green-600">{totalDeliveries}</div>
                    <div className="text-sm text-gray-600">Total Deliveries</div>
                </div>

                <div className="bg-yellow-50 p-3 rounded">
                    <div className="text-2xl font-bold text-yellow-600">{pendingDeliveries}</div>
                    <div className="text-sm text-gray-600">Pending</div>
                </div>

                <div className="bg-purple-50 p-3 rounded">
                    <div className="text-2xl font-bold text-purple-600">{completedDeliveries}</div>
                    <div className="text-sm text-gray-600">Completed</div>
                </div>
            </div>

            {/* AI Decision Metrics */}
            <div className="space-y-3">
                <h3 className="text-md font-semibold text-gray-900">AI Performance</h3>

                <div className="bg-gradient-to-r from-green-50 to-blue-50 p-3 rounded">
                    <div className="flex justify-between items-center">
                        <div className="text-sm text-gray-600">Time Saved</div>
                        <div className="font-bold text-green-600">{timeSavedMinutes} min</div>
                    </div>
                </div>

                <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-3 rounded">
                    <div className="flex justify-between items-center">
                        <div className="text-sm text-gray-600">Decision Latency</div>
                        <div className="font-bold text-blue-600">{decisionLatencyMs}ms</div>
                    </div>
                </div>

                <div className="bg-gradient-to-r from-orange-50 to-red-50 p-3 rounded">
                    <div className="flex justify-between items-center">
                        <div className="text-sm text-gray-600">Rerouted Deliveries</div>
                        <div className="font-bold text-orange-600">{reroutedDeliveries}</div>
                    </div>
                </div>

                <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-3 rounded">
                    <div className="flex justify-between items-center">
                        <div className="text-sm text-gray-600">Completion Rate</div>
                        <div className="font-bold text-gray-600">{completionRate.toFixed(1)}%</div>
                    </div>
                </div>
            </div>

            {/* System Status */}
            <div className="space-y-3">
                <h3 className="text-md font-semibold text-gray-900">System Status</h3>

                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Weather Events</span>
                    <span className={`px-2 py-1 text-xs rounded ${activeEvents > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                        }`}>
                        {activeEvents > 0 ? `${activeEvents} Active` : 'Clear'}
                    </span>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">GraphHopper API</span>
                    <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-600">
                        Connected
                    </span>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Real-time Updates</span>
                    <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-600">
                        Active
                    </span>
                </div>
            </div>

            {/* Progress Bar for Completion Rate */}
            <div className="space-y-2">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Overall Progress</span>
                    <span className="font-medium">{completionRate.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                        className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${completionRate}%` }}
                    ></div>
                </div>
            </div>
        </div>
    );
};

export default MetricsPanel;
