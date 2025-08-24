import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import { useMapEvents } from 'react-leaflet';
import * as L from 'leaflet';
import Dashboard from './components/Dashboard';
import MetricsPanel from './components/MetricsPanel';
import ApiService from './services/api';
import 'leaflet/dist/leaflet.css';

// Initialize API service
const apiService = ApiService;

// Custom marker icons
const createCustomIcon = (color: string) => {
  return new L.DivIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  });
};

const driverIcon = createCustomIcon('#3B82F6');
const pickupIcon = createCustomIcon('#10B981');
const deliveryIcon = createCustomIcon('#F59E0B');

// Types
type PlacementMode = 'none' | 'driver' | 'traffic' | 'storm' | 'pickup' | 'delivery';

interface ExtendedDriver {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  deliveries: Delivery[];
  currentRoute?: [number, number][];
  // Simulation properties
  isMoving?: boolean;
  currentTarget?: 'pickup' | 'delivery';
  currentDeliveryIndex?: number;
  speed?: number; // km/h
  simulationPosition?: [number, number]; // Current position during simulation
  currentRouteIndex?: number; // Track which route point we're heading to
  activeRoute?: [number, number][]; // Current route being followed
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

// Map click handler component
const MapClickHandler: React.FC<{
  placementMode: PlacementMode;
  onMapClick: (latlng: [number, number]) => void;
  onMouseMove?: (latlng: [number, number]) => void;
}> = ({ placementMode, onMapClick, onMouseMove }) => {
  useMapEvents({
    click: (e) => {
      if (placementMode !== 'none') {
        onMapClick([e.latlng.lat, e.latlng.lng]);
      }
    },
    mousemove: (e) => {
      if (onMouseMove && (placementMode === 'traffic' || placementMode === 'storm')) {
        onMouseMove([e.latlng.lat, e.latlng.lng]);
      }
    }
  });
  return null;
};

const App: React.FC = () => {
  // Main state
  const [drivers, setDrivers] = useState<ExtendedDriver[]>([]);
  const [weatherEvents, setWeatherEvents] = useState<WeatherEvent[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Interactive placement state
  const [placementMode, setPlacementMode] = useState<PlacementMode>('none');
  const [pendingDriverName, setPendingDriverName] = useState<string>('');
  const [currentDeliveryPair, setCurrentDeliveryPair] = useState<{
    pickup: [number, number] | null;
    delivery: [number, number] | null;
  }>({ pickup: null, delivery: null });

  // Weather event interactive creation state
  const [pendingWeatherEvent, setPendingWeatherEvent] = useState<{
    center: [number, number];
    type: 'traffic' | 'storm';
    currentRadius: number;
    isDragging: boolean;
  } | null>(null);

  // Simulation state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(50); // km/h
  const [simulationIntervalId, setSimulationIntervalId] = useState<NodeJS.Timeout | null>(null);

  // Load initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [driversData, weatherData, deliveriesData] = await Promise.all([
          ApiService.getDrivers(),
          ApiService.getWeatherEvents(),
          ApiService.getDeliveries()
        ]);

        // Associate deliveries with drivers
        const driversWithDeliveries = driversData.map((driver: any) => ({
          ...driver,
          deliveries: deliveriesData.filter((delivery: any) => delivery.driver_id === driver.id)
        }));

        setDrivers(driversWithDeliveries);
        setWeatherEvents(weatherData);
        setError(null);
      } catch (err: any) {
        console.error('Failed to fetch data:', err);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Interactive placement functions
  const addDriverAtPosition = async (position: [number, number], name: string) => {
    try {
      const newDriverId = `D${String(drivers.length + 1).padStart(3, '0')}`;
      const newDriver = await ApiService.addDriver({
        id: newDriverId,
        name,
        latitude: position[0],
        longitude: position[1]
      });

      const extendedDriver: ExtendedDriver = { ...newDriver, deliveries: [] };
      setDrivers([...drivers, extendedDriver]);

      // Reset placement mode
      setPlacementMode('none');
      setPendingDriverName('');
    } catch (err: any) {
      console.error('Failed to add driver:', err);
      // Fallback to local state
      const newDriver: ExtendedDriver = {
        id: `D${String(drivers.length + 1).padStart(3, '0')}`,
        name,
        latitude: position[0],
        longitude: position[1],
        deliveries: []
      };
      setDrivers([...drivers, newDriver]);
      setPlacementMode('none');
      setPendingDriverName('');
    }
  };

  const addWeatherEventAtPosition = async (position: [number, number], type: 'traffic' | 'storm', radius: number = 0) => {
    try {
      const newEventId = `W${String(weatherEvents.length + 1).padStart(3, '0')}`;
      const eventRadius = radius > 0 ? radius : (type === 'traffic' ? 2 : 5); // Default radius if not provided

      const newEvent = await ApiService.addWeatherEvent({
        id: newEventId,
        type,
        latitude: position[0],
        longitude: position[1],
        radius: eventRadius,
        active: true
      });
      setWeatherEvents([...weatherEvents, newEvent]);
    } catch (err: any) {
      console.error('Failed to add weather event:', err);
      // Fallback to local state
      const eventRadius = radius > 0 ? radius : (type === 'traffic' ? 2 : 5);
      const newEvent: WeatherEvent = {
        id: `W${String(weatherEvents.length + 1).padStart(3, '0')}`,
        type,
        latitude: position[0],
        longitude: position[1],
        radius: eventRadius,
        active: true
      };
      setWeatherEvents([...weatherEvents, newEvent]);
    }
  };

  const addDeliveryPair = async (deliveryPair: { pickup: [number, number], delivery: [number, number] }) => {
    try {
      // Find nearest driver
      const nearestDriver = findNearestDriver(deliveryPair.pickup);
      if (!nearestDriver) {
        alert('No drivers available!');
        return;
      }

      const newDeliveryId = `DEL${String(Date.now()).slice(-6)}`;
      await ApiService.addDelivery({
        id: newDeliveryId,
        pickup_latitude: deliveryPair.pickup[0],
        pickup_longitude: deliveryPair.pickup[1],
        delivery_latitude: deliveryPair.delivery[0],
        delivery_longitude: deliveryPair.delivery[1],
        status: 'pending' as const
      });

      // Update driver's deliveries
      const updatedDriver = {
        ...nearestDriver,
        deliveries: [...nearestDriver.deliveries, {
          id: newDeliveryId,
          pickup_latitude: deliveryPair.pickup[0],
          pickup_longitude: deliveryPair.pickup[1],
          delivery_latitude: deliveryPair.delivery[0],
          delivery_longitude: deliveryPair.delivery[1],
          status: 'pending' as const
        }]
      };

      setDrivers(drivers.map(d => d.id === nearestDriver.id ? updatedDriver : d));

      // Reset delivery pair state
      setCurrentDeliveryPair({ pickup: null, delivery: null });
      setPlacementMode('none');
    } catch (err: any) {
      console.error('Failed to add delivery:', err);
      setPlacementMode('none');
    }
  };

  const findNearestDriver = (position: [number, number]): ExtendedDriver | null => {
    if (drivers.length === 0) return null;

    let nearestDriver = drivers[0];
    let minDistance = Math.sqrt(
      Math.pow(nearestDriver.latitude - position[0], 2) +
      Math.pow(nearestDriver.longitude - position[1], 2)
    );

    for (let i = 1; i < drivers.length; i++) {
      const distance = Math.sqrt(
        Math.pow(drivers[i].latitude - position[0], 2) +
        Math.pow(drivers[i].longitude - position[1], 2)
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearestDriver = drivers[i];
      }
    }

    return nearestDriver;
  };

  // Simulation utility functions
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

  const moveTowardsTarget = (currentPos: [number, number], targetPos: [number, number], speedKmh: number, deltaTimeMs: number): [number, number] => {
    const distance = calculateDistance(currentPos, targetPos);
    const speedKmPerMs = speedKmh / (1000 * 60 * 60); // Convert km/h to km/ms
    const moveDistance = speedKmPerMs * deltaTimeMs;

    if (moveDistance >= distance) {
      return targetPos; // Reached target
    }

    const ratio = moveDistance / distance;
    const newLat = currentPos[0] + (targetPos[0] - currentPos[0]) * ratio;
    const newLng = currentPos[1] + (targetPos[1] - currentPos[1]) * ratio;

    return [newLat, newLng];
  };

  const startSimulation = async () => {
    if (isSimulating) return;

    setIsSimulating(true);

    // Initialize simulation state for drivers with deliveries
    const updatedDrivers = await Promise.all(
      drivers.map(async (driver) => {
        if (driver.deliveries.length > 0 && !driver.isMoving) {
          const currentDelivery = driver.deliveries[0];

          // Calculate route from driver to pickup location
          const routeRequestPoints = [
            [driver.latitude, driver.longitude] as [number, number],
            [currentDelivery.pickup_latitude, currentDelivery.pickup_longitude] as [number, number]
          ];
          console.log('Requesting route for driver', driver.name, 'from', routeRequestPoints[0], 'to', routeRequestPoints[1]);
          const routeResult = await apiService.calculateRoute(routeRequestPoints);
          console.log('Route result for driver', driver.name, ':', routeResult);

          const routePoints = routeResult.route || [];
          console.log('Route points for driver', driver.name, ':', routePoints.length, 'points');

          return {
            ...driver,
            isMoving: true,
            currentTarget: 'pickup' as const,
            currentDeliveryIndex: 0,
            speed: simulationSpeed,
            simulationPosition: [driver.latitude, driver.longitude] as [number, number],
            activeRoute: routePoints,
            currentRouteIndex: 0
          };
        }
        return driver;
      })
    );

    setDrivers(updatedDrivers);

    const intervalId = setInterval(() => {
      updateDriverPositions();
    }, 100); // Update every 100ms for smooth animation

    setSimulationIntervalId(intervalId);
  };

  const stopSimulation = () => {
    if (!isSimulating) return;

    setIsSimulating(false);

    if (simulationIntervalId) {
      clearInterval(simulationIntervalId);
      setSimulationIntervalId(null);
    }

    // Reset simulation state
    setDrivers(prevDrivers => prevDrivers.map(driver => ({
      ...driver,
      isMoving: false,
      currentTarget: undefined,
      currentDeliveryIndex: undefined,
      simulationPosition: undefined,
      activeRoute: undefined,
      currentRouteIndex: undefined
    })));
  };

  const updateDriverPositions = () => {
    setDrivers(prevDrivers => prevDrivers.map(driver => {
      if (!driver.isMoving || !driver.simulationPosition || driver.deliveries.length === 0) {
        return driver;
      }

      // If we have an active route, follow it
      if (driver.activeRoute && driver.activeRoute.length > 0 && driver.currentRouteIndex !== undefined) {
        const currentRouteIndex = driver.currentRouteIndex;
        console.log(`Driver ${driver.name} following route: ${currentRouteIndex}/${driver.activeRoute.length} points`);

        if (currentRouteIndex >= driver.activeRoute.length) {
          // Reached end of current route
          const currentDelivery = driver.deliveries[driver.currentDeliveryIndex || 0];
          if (!currentDelivery) return driver;

          if (driver.currentTarget === 'pickup') {
            // Reached pickup, now calculate route to delivery
            const calculateDeliveryRoute = async () => {
              const routeRequestPoints = [
                [currentDelivery.pickup_latitude, currentDelivery.pickup_longitude] as [number, number],
                [currentDelivery.delivery_latitude, currentDelivery.delivery_longitude] as [number, number]
              ];
              const routeResult = await apiService.calculateRoute(routeRequestPoints);
              const deliveryRoutePoints = routeResult.route || [];

              setDrivers(prevDrivers => prevDrivers.map(d =>
                d.id === driver.id ? {
                  ...d,
                  simulationPosition: [currentDelivery.pickup_latitude, currentDelivery.pickup_longitude] as [number, number],
                  currentTarget: 'delivery' as const,
                  activeRoute: deliveryRoutePoints,
                  currentRouteIndex: 0,
                  deliveries: d.deliveries.map((delivery, idx) =>
                    idx === (d.currentDeliveryIndex || 0)
                      ? { ...delivery, status: 'picked_up' as const }
                      : delivery
                  )
                } : d
              ));
            };
            calculateDeliveryRoute();
            return driver;
          } else {
            // Reached delivery location
            const nextDeliveryIndex = (driver.currentDeliveryIndex || 0) + 1;
            const hasMoreDeliveries = nextDeliveryIndex < driver.deliveries.length;

            if (hasMoreDeliveries) {
              // Calculate route to next pickup
              const nextDelivery = driver.deliveries[nextDeliveryIndex];
              const calculateNextRoute = async () => {
                const routeRequestPoints = [
                  [currentDelivery.delivery_latitude, currentDelivery.delivery_longitude] as [number, number],
                  [nextDelivery.pickup_latitude, nextDelivery.pickup_longitude] as [number, number]
                ];
                const routeResult = await apiService.calculateRoute(routeRequestPoints);
                const nextRoutePoints = routeResult.route || [];

                setDrivers(prevDrivers => prevDrivers.map(d =>
                  d.id === driver.id ? {
                    ...d,
                    simulationPosition: [currentDelivery.delivery_latitude, currentDelivery.delivery_longitude] as [number, number],
                    currentTarget: 'pickup' as const,
                    currentDeliveryIndex: nextDeliveryIndex,
                    activeRoute: nextRoutePoints,
                    currentRouteIndex: 0,
                    deliveries: d.deliveries.map((delivery, idx) =>
                      idx === (d.currentDeliveryIndex || 0)
                        ? { ...delivery, status: 'delivered' as const }
                        : delivery
                    )
                  } : d
                ));
              };
              calculateNextRoute();
              return driver;
            } else {
              // All deliveries completed
              return {
                ...driver,
                simulationPosition: [currentDelivery.delivery_latitude, currentDelivery.delivery_longitude] as [number, number],
                isMoving: false,
                currentTarget: undefined,
                currentDeliveryIndex: undefined,
                activeRoute: undefined,
                currentRouteIndex: undefined,
                deliveries: driver.deliveries.map((delivery, idx) =>
                  idx === (driver.currentDeliveryIndex || 0)
                    ? { ...delivery, status: 'delivered' as const }
                    : delivery
                )
              };
            }
          }
        }

        // Move towards next route point
        const targetPoint = driver.activeRoute[currentRouteIndex];
        const newPos = moveTowardsTarget(driver.simulationPosition, targetPoint, driver.speed || simulationSpeed, 100);

        // Check if reached current route point
        const distanceToPoint = calculateDistance(newPos, targetPoint);
        const hasReachedPoint = distanceToPoint < 0.01; // Within 10 meters

        if (hasReachedPoint) {
          return {
            ...driver,
            simulationPosition: targetPoint,
            currentRouteIndex: currentRouteIndex + 1
          };
        }

        return {
          ...driver,
          simulationPosition: newPos
        };
      }

      // Fallback to old straight-line movement if no route
      const currentDelivery = driver.deliveries[driver.currentDeliveryIndex || 0];
      if (!currentDelivery) return driver;

      const targetPos: [number, number] = driver.currentTarget === 'pickup'
        ? [currentDelivery.pickup_latitude, currentDelivery.pickup_longitude]
        : [currentDelivery.delivery_latitude, currentDelivery.delivery_longitude];

      const newPos = moveTowardsTarget(driver.simulationPosition, targetPos, driver.speed || simulationSpeed, 100);

      // Check if reached target
      const distanceToTarget = calculateDistance(newPos, targetPos);
      const hasReachedTarget = distanceToTarget < 0.01; // Within 10 meters

      if (hasReachedTarget) {
        if (driver.currentTarget === 'pickup') {
          return {
            ...driver,
            simulationPosition: targetPos,
            currentTarget: 'delivery' as const,
            deliveries: driver.deliveries.map((delivery, idx) =>
              idx === (driver.currentDeliveryIndex || 0)
                ? { ...delivery, status: 'picked_up' as const }
                : delivery
            )
          };
        } else {
          const nextDeliveryIndex = (driver.currentDeliveryIndex || 0) + 1;
          const hasMoreDeliveries = nextDeliveryIndex < driver.deliveries.length;

          if (hasMoreDeliveries) {
            return {
              ...driver,
              simulationPosition: targetPos,
              currentTarget: 'pickup' as const,
              currentDeliveryIndex: nextDeliveryIndex,
              deliveries: driver.deliveries.map((delivery, idx) =>
                idx === (driver.currentDeliveryIndex || 0)
                  ? { ...delivery, status: 'delivered' as const }
                  : delivery
              )
            };
          } else {
            return {
              ...driver,
              simulationPosition: targetPos,
              isMoving: false,
              currentTarget: undefined,
              currentDeliveryIndex: undefined,
              deliveries: driver.deliveries.map((delivery, idx) =>
                idx === (driver.currentDeliveryIndex || 0)
                  ? { ...delivery, status: 'delivered' as const }
                  : delivery
              )
            };
          }
        }
      }

      return {
        ...driver,
        simulationPosition: newPos
      };
    }));
  };

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (simulationIntervalId) {
        clearInterval(simulationIntervalId);
      }
    };
  }, [simulationIntervalId]);

  // Map click handler
  const handleMapClick = useCallback((latlng: [number, number]) => {
    if (placementMode === 'driver' && pendingDriverName) {
      addDriverAtPosition(latlng, pendingDriverName);
    } else if (placementMode === 'traffic') {
      if (!pendingWeatherEvent) {
        // First click: set center and start dragging
        setPendingWeatherEvent({
          center: latlng,
          type: 'traffic',
          currentRadius: 500, // Default starting radius
          isDragging: true
        });
      } else if (pendingWeatherEvent.isDragging) {
        // Second click: finalize the weather event
        // First stop dragging to prevent mousemove interference
        setPendingWeatherEvent(prev => prev ? { ...prev, isDragging: false } : null);
        // Then create the event after a brief delay
        setTimeout(() => {
          // Convert radius from meters to kilometers before storing
          const radiusInKm = pendingWeatherEvent.currentRadius / 1000;
          addWeatherEventAtPosition(pendingWeatherEvent.center, 'traffic', radiusInKm);
          setPendingWeatherEvent(null);
          setPlacementMode('none');
        }, 50);
      }
    } else if (placementMode === 'storm') {
      if (!pendingWeatherEvent) {
        // First click: set center and start dragging
        setPendingWeatherEvent({
          center: latlng,
          type: 'storm',
          currentRadius: 500, // Default starting radius
          isDragging: true
        });
      } else if (pendingWeatherEvent.isDragging) {
        // Second click: finalize the weather event
        // First stop dragging to prevent mousemove interference
        setPendingWeatherEvent(prev => prev ? { ...prev, isDragging: false } : null);
        // Then create the event after a brief delay
        setTimeout(() => {
          // Convert radius from meters to kilometers before storing
          const radiusInKm = pendingWeatherEvent.currentRadius / 1000;
          addWeatherEventAtPosition(pendingWeatherEvent.center, 'storm', radiusInKm);
          setPendingWeatherEvent(null);
          setPlacementMode('none');
        }, 50);
      }
    } else if (placementMode === 'pickup') {
      setCurrentDeliveryPair({ pickup: latlng, delivery: null });
      setPlacementMode('delivery');
    } else if (placementMode === 'delivery' && currentDeliveryPair.pickup) {
      addDeliveryPair({ pickup: currentDeliveryPair.pickup, delivery: latlng });
    }
  }, [placementMode, pendingDriverName, currentDeliveryPair, pendingWeatherEvent]);

  // Mouse move handler for weather event radius adjustment
  const handleMouseMove = useCallback((latlng: [number, number]) => {
    if (pendingWeatherEvent && pendingWeatherEvent.isDragging) {
      // Calculate distance between center and current position
      const [lat1, lon1] = pendingWeatherEvent.center;
      const [lat2, lon2] = latlng;

      // Simple distance calculation (approximate for small distances)
      const R = 6371000; // Earth's radius in meters
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      // Update the radius (minimum 50m, no maximum limit)
      const newRadius = Math.max(50, distance);

      setPendingWeatherEvent(prev => prev ? {
        ...prev,
        currentRadius: newRadius
      } : null);
    }
  }, [pendingWeatherEvent]);

  // Dashboard callbacks
  const handleAddDriver = (name: string) => {
    setPendingDriverName(name);
    setPlacementMode('driver');
  };

  const handleSimulateTraffic = () => {
    setPlacementMode('traffic');
  };

  const handleSimulateStorm = () => {
    setPlacementMode('storm');
  };

  const handleAddDelivery = () => {
    setPlacementMode('pickup');
    setCurrentDeliveryPair({ pickup: null, delivery: null });
  };

  const handleCancelPlacement = () => {
    setPlacementMode('none');
    setPendingDriverName('');
    setCurrentDeliveryPair({ pickup: null, delivery: null });
    setPendingWeatherEvent(null);
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

  // Fetch driver route when selected
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
        console.error('Failed to fetch driver route:', err);
      }
    };

    if (selectedDriver) {
      fetchDriverRoute(selectedDriver);
    }
  }, [selectedDriver, drivers.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-lg text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-red-50">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-red-800 mb-2">Error Loading Dashboard</h1>
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Left Panel - Dashboard */}
      <div className="w-80 bg-white shadow-lg">
        <Dashboard
          drivers={drivers}
          weatherEvents={weatherEvents}
          onAddDriver={handleAddDriver}
          onSimulateTraffic={handleSimulateTraffic}
          onSimulateStorm={handleSimulateStorm}
          onAddDelivery={handleAddDelivery}
          onToggleWeatherEvent={toggleWeatherEvent}
          onSelectDriver={setSelectedDriver}
          selectedDriver={selectedDriver}
          placementMode={placementMode}
          onCancelPlacement={handleCancelPlacement}
          isSimulating={isSimulating}
          simulationSpeed={simulationSpeed}
          onStartSimulation={startSimulation}
          onStopSimulation={stopSimulation}
          onSpeedChange={setSimulationSpeed}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Metrics Panel */}
        <div className="h-32 bg-white shadow-sm">
          <MetricsPanel drivers={drivers} weatherEvents={weatherEvents} />
        </div>

        {/* Map Container */}
        <div className="flex-1 relative">
          <MapContainer
            center={[19.0760, 72.8777]}
            zoom={12}
            className="h-full w-full"
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />

            {/* Map Click Handler */}
            <MapClickHandler
              placementMode={placementMode}
              onMapClick={handleMapClick}
              onMouseMove={handleMouseMove}
            />

            {/* Driver Markers */}
            {drivers.map((driver) => {
              const position = driver.simulationPosition || [driver.latitude, driver.longitude];
              const isMoving = driver.isMoving && isSimulating;

              return (
                <Marker
                  key={driver.id}
                  position={position}
                  icon={driverIcon}
                >
                  <Popup>
                    <div>
                      <strong>{driver.name}</strong><br />
                      ID: {driver.id}<br />
                      Deliveries: {driver.deliveries.length}<br />
                      {isMoving && (
                        <>Status: Moving to {driver.currentTarget === 'pickup' ? 'Pickup' : 'Delivery'}<br /></>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Driver Routes */}
            {drivers.map((driver) =>
              driver.currentRoute && selectedDriver === driver.id ? (
                <Polyline
                  key={`route-${driver.id}`}
                  positions={driver.currentRoute}
                  color="#3B82F6"
                  weight={3}
                  opacity={0.8}
                />
              ) : null
            )}

            {/* Pickup/Delivery Markers */}
            {drivers.flatMap((driver) =>
              driver.deliveries.flatMap((delivery) => [
                <Marker
                  key={`pickup-${delivery.id}`}
                  position={[delivery.pickup_latitude, delivery.pickup_longitude]}
                  icon={pickupIcon}
                >
                  <Popup>
                    <div>
                      <strong>Pickup Location</strong><br />
                      Delivery ID: {delivery.id}<br />
                      Status: {delivery.status}
                    </div>
                  </Popup>
                </Marker>,
                <Marker
                  key={`delivery-${delivery.id}`}
                  position={[delivery.delivery_latitude, delivery.delivery_longitude]}
                  icon={deliveryIcon}
                >
                  <Popup>
                    <div>
                      <strong>Delivery Location</strong><br />
                      Delivery ID: {delivery.id}<br />
                      Status: {delivery.status}
                    </div>
                  </Popup>
                </Marker>
              ])
            )}

            {/* Weather Event Circles */}
            {weatherEvents
              .filter(event => event.active)
              .map((event) => (
                <Circle
                  key={event.id}
                  center={[event.latitude, event.longitude]}
                  radius={event.radius * 1000}
                  pathOptions={{
                    color: event.type === 'traffic' ? '#EF4444' : '#8B5CF6',
                    fillColor: event.type === 'traffic' ? '#FEE2E2' : '#F3E8FF',
                    fillOpacity: 0.3,
                    weight: 2
                  }}
                >
                  <Popup>
                    <div>
                      <strong>{event.type.charAt(0).toUpperCase() + event.type.slice(1)}</strong><br />
                      ID: {event.id}<br />
                      Radius: {event.radius.toFixed(1)}km
                    </div>
                  </Popup>
                </Circle>
              ))
            }

            {/* Pending Weather Event Preview Circle */}
            {pendingWeatherEvent && (
              <Circle
                center={pendingWeatherEvent.center}
                radius={pendingWeatherEvent.currentRadius}
                pathOptions={{
                  color: pendingWeatherEvent.type === 'traffic' ? '#EF4444' : '#8B5CF6',
                  fillColor: pendingWeatherEvent.type === 'traffic' ? '#FEE2E2' : '#F3E8FF',
                  fillOpacity: 0.2,
                  weight: 3,
                  dashArray: '10, 5' // Dashed line to indicate it's a preview
                }}
              />
            )}

            {/* Temporary markers for delivery placement */}
            {currentDeliveryPair.pickup && (
              <Marker
                position={currentDeliveryPair.pickup}
                icon={pickupIcon}
              >
                <Popup>Pickup Location (Click map to set delivery)</Popup>
              </Marker>
            )}
          </MapContainer>

          {/* Placement Status */}
          {placementMode !== 'none' && (
            <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-3 z-1000">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {placementMode === 'driver' && 'Click on map to place driver'}
                    {placementMode === 'traffic' && !pendingWeatherEvent && 'Click on map to set center of traffic area'}
                    {placementMode === 'traffic' && pendingWeatherEvent && pendingWeatherEvent.isDragging && 'Move mouse to adjust size, click to confirm'}
                    {placementMode === 'traffic' && pendingWeatherEvent && !pendingWeatherEvent.isDragging && 'Creating traffic area...'}
                    {placementMode === 'storm' && !pendingWeatherEvent && 'Click on map to set center of storm area'}
                    {placementMode === 'storm' && pendingWeatherEvent && pendingWeatherEvent.isDragging && 'Move mouse to adjust size, click to confirm'}
                    {placementMode === 'storm' && pendingWeatherEvent && !pendingWeatherEvent.isDragging && 'Creating storm area...'}
                    {placementMode === 'pickup' && 'Click on map to set pickup location'}
                    {placementMode === 'delivery' && 'Click on map to set delivery location'}
                  </p>
                  {pendingDriverName && (
                    <p className="text-xs text-blue-600">Driver: {pendingDriverName}</p>
                  )}
                  {pendingWeatherEvent && (
                    <p className="text-xs text-purple-600">
                      Radius: {(pendingWeatherEvent.currentRadius / 1000).toFixed(1)}km
                    </p>
                  )}
                </div>
                <button
                  onClick={handleCancelPlacement}
                  className="ml-3 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
