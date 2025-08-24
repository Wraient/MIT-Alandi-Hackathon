import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import Dashboard from './components/Dashboard';
import MetricsPanel from './components/MetricsPanel';
import ApiService, { Driver, Delivery, WeatherEvent } from './services/api';
import './App.css';

// Fix default markers in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

interface ExtendedDriver extends Driver {
  deliveries: Delivery[];
  currentRoute?: [number, number][];
}

function App() {
  const [drivers, setDrivers] = useState<ExtendedDriver[]>([]);
  const [weatherEvents, setWeatherEvents] = useState<WeatherEvent[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [mapCenter] = useState<[number, number]>([19.0760, 72.8777]); // Mumbai coordinates
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [driversData, deliveriesData, weatherEventsData] = await Promise.all([
          ApiService.getDrivers(),
          ApiService.getDeliveries(),
          ApiService.getWeatherEvents()
        ]);

        // Combine drivers with their deliveries
        const extendedDrivers: ExtendedDriver[] = driversData.map(driver => ({
          ...driver,
          deliveries: deliveriesData.filter(d => d.driver_id === driver.id)
        }));

        setDrivers(extendedDrivers);
        setWeatherEvents(weatherEventsData);
        setError(null);
      } catch (err: any) {
        console.error('Failed to fetch data:', err);
        setError(err.message || 'Failed to fetch data');

        // Set demo data as fallback
        const demoDrivers: ExtendedDriver[] = [
          {
            id: 'D001',
            name: 'John Doe',
            latitude: 19.0760,
            longitude: 72.8777,
            deliveries: [
              {
                id: 'DEL001',
                pickup_latitude: 19.0760,
                pickup_longitude: 72.8777,
                delivery_latitude: 19.1158,
                delivery_longitude: 72.8560,
                status: 'pending'
              },
              {
                id: 'DEL002',
                pickup_latitude: 19.1158,
                pickup_longitude: 72.8560,
                delivery_latitude: 19.0822,
                delivery_longitude: 72.8411,
                status: 'pending'
              }
            ]
          },
          {
            id: 'D002',
            name: 'Jane Smith',
            latitude: 19.1158,
            longitude: 72.8560,
            deliveries: [
              {
                id: 'DEL003',
                pickup_latitude: 19.1158,
                pickup_longitude: 72.8560,
                delivery_latitude: 19.0596,
                delivery_longitude: 72.8295,
                status: 'pending'
              }
            ]
          }
        ];
        setDrivers(demoDrivers);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const addDriver = async (driverData: Omit<ExtendedDriver, 'id' | 'deliveries'>) => {
    try {
      const newDriverId = `D${String(drivers.length + 1).padStart(3, '0')}`;
      const newDriver = await ApiService.addDriver({
        id: newDriverId,
        name: driverData.name,
        latitude: driverData.latitude,
        longitude: driverData.longitude
      });

      const extendedDriver: ExtendedDriver = {
        ...newDriver,
        deliveries: []
      };

      setDrivers([...drivers, extendedDriver]);
    } catch (err: any) {
      console.error('Failed to add driver:', err);
      // Fallback to local state update
      const newDriver: ExtendedDriver = {
        id: `D${String(drivers.length + 1).padStart(3, '0')}`,
        name: driverData.name,
        latitude: driverData.latitude,
        longitude: driverData.longitude,
        deliveries: []
      };
      setDrivers([...drivers, newDriver]);
    }
  };

  const addWeatherEvent = async (eventData: Omit<WeatherEvent, 'id'>) => {
    try {
      const newEventId = `W${String(weatherEvents.length + 1).padStart(3, '0')}`;
      const newEvent = await ApiService.addWeatherEvent({
        id: newEventId,
        ...eventData
      });
      setWeatherEvents([...weatherEvents, newEvent]);
    } catch (err: any) {
      console.error('Failed to add weather event:', err);
      // Fallback to local state update
      const newEvent: WeatherEvent = {
        id: `W${String(weatherEvents.length + 1).padStart(3, '0')}`,
        ...eventData
      };
      setWeatherEvents([...weatherEvents, newEvent]);
    }
  };

  const toggleWeatherEvent = async (eventId: string) => {
    try {
      const updatedEvent = await ApiService.toggleWeatherEvent(eventId);
      setWeatherEvents(weatherEvents.map(event =>
        event.id === eventId ? updatedEvent : event
      ));
    } catch (err: any) {
      console.error('Failed to toggle weather event:', err);
      // Fallback to local state update
      setWeatherEvents(weatherEvents.map(event =>
        event.id === eventId ? { ...event, active: !event.active } : event
      ));
    }
  };

  // Auto-fetch route when driver is selected
  useEffect(() => {
    const fetchDriverRoute = async (driverId: string) => {
      try {
        const routeData = await ApiService.getDriverRoute(driverId);
        setDrivers(drivers.map(driver =>
          driver.id === driverId
            ? { ...driver, currentRoute: routeData.route }
            : driver
        ));
      } catch (err: any) {
        console.error('Failed to fetch route:', err);
      }
    };

    if (selectedDriver) {
      fetchDriverRoute(selectedDriver);
    }
  }, [selectedDriver, drivers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading logistics dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          <p className="text-sm">
            <strong>Warning:</strong> {error}. Using demo data.
          </p>
        </div>
      )}

      {/* Dashboard Panel */}
      <div className="w-80 bg-white shadow-lg z-10">
        <Dashboard
          drivers={drivers}
          weatherEvents={weatherEvents}
          onAddDriver={addDriver}
          onAddWeatherEvent={addWeatherEvent}
          onToggleWeatherEvent={toggleWeatherEvent}
          onSelectDriver={setSelectedDriver}
          selectedDriver={selectedDriver}
        />
      </div>

      {/* Map Container */}
      <div className="flex-1 relative">
        <MapContainer
          center={mapCenter}
          zoom={12}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Driver Markers */}
          {drivers.map((driver) => (
            <Marker
              key={driver.id}
              position={[driver.latitude, driver.longitude]}
              icon={L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
              })}
            >
              <Popup>
                <div>
                  <h3 className="font-bold">{driver.name}</h3>
                  <p>ID: {driver.id}</p>
                  <p>Deliveries: {driver.deliveries.length}</p>
                  <button
                    onClick={() => setSelectedDriver(driver.id)}
                    className="mt-2 px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                  >
                    Show Route
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Delivery Markers */}
          {drivers.map((driver) =>
            driver.deliveries.map((delivery) => (
              <React.Fragment key={delivery.id}>
                <Marker
                  position={[delivery.pickup_latitude, delivery.pickup_longitude]}
                  icon={L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                  })}
                >
                  <Popup>
                    <div>
                      <h4 className="font-bold">Pickup: {delivery.id}</h4>
                      <p>Driver: {driver.name}</p>
                      <p>Status: {delivery.status}</p>
                    </div>
                  </Popup>
                </Marker>
                <Marker
                  position={[delivery.delivery_latitude, delivery.delivery_longitude]}
                  icon={L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                  })}
                >
                  <Popup>
                    <div>
                      <h4 className="font-bold">Delivery: {delivery.id}</h4>
                      <p>Driver: {driver.name}</p>
                      <p>Status: {delivery.status}</p>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            ))
          )}

          {/* Weather Events */}
          {weatherEvents.filter(event => event.active).map((event) => (
            <Marker
              key={event.id}
              position={[event.latitude, event.longitude]}
              icon={L.icon({
                iconUrl: event.type === 'storm'
                  ? 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png'
                  : 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
              })}
            >
              <Popup>
                <div>
                  <h4 className="font-bold capitalize">{event.type}</h4>
                  <p>ID: {event.id}</p>
                  <p>Radius: {event.radius}km</p>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Route Lines */}
          {drivers.map((driver) =>
            driver.currentRoute && (
              <Polyline
                key={`route-${driver.id}`}
                positions={driver.currentRoute}
                color="blue"
                weight={4}
                opacity={0.7}
              />
            )
          )}
        </MapContainer>

        {/* Metrics Panel Overlay */}
        <div className="absolute top-4 right-4 w-80">
          <MetricsPanel drivers={drivers} weatherEvents={weatherEvents} />
        </div>
      </div>
    </div>
  );
}

export default App;
