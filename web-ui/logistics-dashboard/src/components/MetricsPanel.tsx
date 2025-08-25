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
        <div className="bg-gray-800 rounded-lg shadow-lg p-4 space-y-4 border border-gray-700">
            <div className="border-b border-gray-600 pb-2">
                <h2 className="text-lg font-semibold text-gray-100">System Metrics</h2>
                <p className="text-sm text-gray-300">Real-time performance dashboard</p>
            </div>

            {/* Key Performance Indicators */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-900/30 border border-blue-700 p-3 rounded-lg">
                    <div className="text-2xl font-bold text-blue-300">{drivers.length}</div>
                    <div className="text-sm text-gray-300">Active Drivers</div>
                </div>

                <div className="bg-green-900/30 border border-green-700 p-3 rounded-lg">
                    <div className="text-2xl font-bold text-green-300">{totalDeliveries}</div>
                    <div className="text-sm text-gray-300">Total Deliveries</div>
                </div>

                <div className="bg-yellow-900/30 border border-yellow-700 p-3 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-300">{pendingDeliveries}</div>
                    <div className="text-sm text-gray-300">Pending</div>
                </div>

                <div className="bg-purple-900/30 border border-purple-700 p-3 rounded-lg">
                    <div className="text-2xl font-bold text-purple-300">{completedDeliveries}</div>
                    <div className="text-sm text-gray-300">Completed</div>
                </div>
            </div>

            {/* AI Decision Metrics */}
            <div className="space-y-3">
                <h3 className="text-md font-semibold text-gray-100">AI Performance</h3>

                <div className="bg-gradient-to-r from-green-900/40 to-blue-900/40 border border-green-700 p-3 rounded-lg">
                    <div className="flex justify-between items-center">
                        <div className="text-sm text-gray-300">Time Saved</div>
                        <div className="font-bold text-green-300">{timeSavedMinutes} min</div>
                    </div>
                </div>

                <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border border-blue-700 p-3 rounded-lg">
                    <div className="flex justify-between items-center">
                        <div className="text-sm text-gray-300">Decision Latency</div>
                        <div className="font-bold text-blue-300">{decisionLatencyMs}ms</div>
                    </div>
                </div>

                <div className="bg-gradient-to-r from-orange-900/40 to-red-900/40 border border-orange-700 p-3 rounded-lg">
                    <div className="flex justify-between items-center">
                        <div className="text-sm text-gray-300">Rerouted Deliveries</div>
                        <div className="font-bold text-orange-300">{reroutedDeliveries}</div>
                    </div>
                </div>

                <div className="bg-gradient-to-r from-gray-700 to-gray-800 border border-gray-600 p-3 rounded-lg">
                    <div className="flex justify-between items-center">
                        <div className="text-sm text-gray-300">Completion Rate</div>
                        <div className="font-bold text-gray-100">{completionRate.toFixed(1)}%</div>
                    </div>
                </div>
            </div>

            {/* System Status */}
            <div className="space-y-3">
                <h3 className="text-md font-semibold text-gray-100">System Status</h3>

                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Weather Events</span>
                    <span className={`px-2 py-1 text-xs rounded border ${activeEvents > 0 ? 'bg-red-900/50 text-red-300 border-red-700' : 'bg-green-900/50 text-green-300 border-green-700'
                        }`}>
                        {activeEvents > 0 ? `${activeEvents} Active` : 'Clear'}
                    </span>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">GraphHopper API</span>
                    <span className="px-2 py-1 text-xs rounded bg-green-900/50 text-green-300 border border-green-700">
                        Connected
                    </span>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Real-time Updates</span>
                    <span className="px-2 py-1 text-xs rounded bg-green-900/50 text-green-300 border border-green-700">
                        Active
                    </span>
                </div>
            </div>

            {/* Progress Bar for Completion Rate */}
            <div className="space-y-2">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-300">Overall Progress</span>
                    <span className="font-medium text-gray-100">{completionRate.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
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
