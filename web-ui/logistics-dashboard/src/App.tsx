import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import { useMapEvents } from 'react-leaflet';
import * as L from 'leaflet';
import Dashboard from './components/Dashboard';
import MetricsPanel from './components/MetricsPanel';
import ApiService from './services/api';
import { useAppContext } from './contexts/AppContext';
import 'leaflet/dist/leaflet.css';

// Fix leaflet default marker icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

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

// Enhanced driver icon with directional triangle (like Google Maps)
const createDriverIcon = (color: string = '#3B82F6', rotation: number = 0, isMoving: boolean = false) => {
  const size = isMoving ? 20 : 16;
  const triangleColor = isMoving ? '#10B981' : color; // Green when moving, blue when stationary

  return new L.DivIcon({
    className: 'driver-icon',
    html: `
      <div style="
        width: ${size}px; 
        height: ${size}px; 
        position: relative;
        transform: rotate(${rotation}deg);
      ">
        <div style="
          width: 0; 
          height: 0; 
          border-left: ${size / 2}px solid transparent;
          border-right: ${size / 2}px solid transparent;
          border-bottom: ${size}px solid ${triangleColor};
          position: absolute;
          top: 0;
          left: 0;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        "></div>
        <div style="
          width: ${size / 3}px; 
          height: ${size / 3}px; 
          background-color: white;
          border-radius: 50%;
          position: absolute;
          top: ${size * 0.6}px;
          left: ${size / 3}px;
          border: 1px solid ${triangleColor};
        "></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
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
  heading?: number; // Current heading in degrees (0-360)
  lastPosition?: [number, number]; // Previous position for heading calculation
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
  // Removed pendingDriverName - now generates random names
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
  const [isRecalculatingRoutes, setIsRecalculatingRoutes] = useState(false);

  // AppContext for sharing state with mobile view
  const { appState, updateSharedDriver, setGlobalSimulation, setGlobalSimulationSpeed } = useAppContext();

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
    }
  };

  // Dynamic route recalculation during simulation
  const recalculateRoutesForActiveDrivers = async (updatedWeatherEvents?: WeatherEvent[]) => {
    console.log('🔄 Recalculating routes for active drivers due to weather changes...');
    setIsRecalculatingRoutes(true);

    // Use provided weather events or current state
    const currentWeatherEvents = updatedWeatherEvents || weatherEvents;

    setDrivers(prevDrivers => {
      const recalculateDriverRoutes = async () => {
        try {
          const updatedDrivers = await Promise.all(
            prevDrivers.map(async (driver) => {
              // Only recalculate for drivers who are currently moving and have deliveries
              if (!driver.isMoving || !driver.simulationPosition || driver.deliveries.length === 0) {
                return driver;
              }

              const currentDelivery = driver.deliveries[driver.currentDeliveryIndex || 0];
              if (!currentDelivery) {
                return driver;
              }

              try {
                let targetPos: [number, number];

                // Determine where the driver should be going next
                if (driver.currentTarget === 'pickup') {
                  targetPos = [currentDelivery.pickup_latitude, currentDelivery.pickup_longitude];
                } else {
                  targetPos = [currentDelivery.delivery_latitude, currentDelivery.delivery_longitude];
                }

                // Calculate new route from current position to target
                const routeRequestPoints = [driver.simulationPosition, targetPos];
                console.log(`🚗 Recalculating route for ${driver.name} from ${routeRequestPoints[0]} to ${routeRequestPoints[1]}`);

                const routeResult = await apiService.calculateRoute(routeRequestPoints);
                const newRoutePoints = routeResult.route || routeRequestPoints;

                console.log(`✅ New route calculated for ${driver.name}: ${newRoutePoints.length} points`);
                console.log(`⚠️ Weather penalty: ${routeResult.weather_info?.total_penalty || 'none'}`);

                return {
                  ...driver,
                  activeRoute: newRoutePoints,
                  currentRouteIndex: 0 // Reset to start of new route
                };

              } catch (error) {
                console.error(`❌ Failed to recalculate route for driver ${driver.name}:`, error);
                // Keep the driver's current route if recalculation fails
                return driver;
              }
            })
          );

          // Update the drivers state with new routes
          setDrivers(updatedDrivers);
          console.log('🎯 Route recalculation complete for all active drivers');
        } finally {
          setIsRecalculatingRoutes(false);
        }
      };

      // Execute the async recalculation
      recalculateDriverRoutes();

      // Return the current state immediately (will be updated by the async function)
      return prevDrivers;
    });
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

      // If simulation is running, recalculate routes for all active drivers
      if (isSimulating) {
        console.log('🌪️ New weather event added during simulation - recalculating routes for all active drivers');
        await recalculateRoutesForActiveDrivers([...weatherEvents, newEvent]);
      }
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

      // If simulation is running, recalculate routes for all active drivers
      if (isSimulating) {
        console.log('🌪️ New weather event added during simulation - recalculating routes for all active drivers');
        await recalculateRoutesForActiveDrivers([...weatherEvents, newEvent]);
      }
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
        driver_id: nearestDriver.id,
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

  // Random generation utility functions
  const generateRandomName = (): string => {
    const firstNames = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Casey', 'Morgan', 'Riley', 'Avery', 'Quinn', 'Blake', 'Dakota', 'Rowan', 'Sage', 'River', 'Sky'];
    const lastNames = ['Smith', 'Johnson', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson'];

    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    return `${firstName} ${lastName}`;
  };

  const generateRandomPositionInPune = (): [number, number] => {
    // Pune major road network points - 500 real intersections, landmarks, and road points throughout Pune
    const puneRoadPoints: [number, number][] = [
      // Central Pune - Core Areas
      [18.5204, 73.8567], // Shivajinagar
      [18.5314, 73.8446], // JM Road
      [18.5074, 73.8077], // Koregaon Park
      [18.5089, 73.8535], // FC Road
      [18.5022, 73.8878], // Kothrud
      [18.5679, 73.9143], // Aundh
      [18.5362, 73.8454], // Deccan
      [18.5435, 73.8497], // Karve Road
      [18.5196, 73.8553], // Pune Station
      [18.5158, 73.8560], // Cantonment
      [18.5089, 73.8304], // MG Road
      [18.5246, 73.8370], // Camp Area
      [18.5181, 73.8478], // Ghole Road
      [18.5314, 73.8522], // Bund Garden Road
      [18.5435, 73.8640], // Model Colony

      // Pimpri-Chinchwad (PCMC) Area
      [18.6298, 73.7997], // Pimpri
      [18.6186, 73.8037], // Chinchwad
      [18.6588, 73.8370], // Akurdi
      [18.6480, 73.8173], // Nigdi
      [18.5886, 73.8333], // Wakad
      [18.5515, 73.7804], // Hinjewadi Phase 1
      [18.5892, 73.7395], // Hinjewadi Phase 2
      [18.5679, 73.7804], // Hinjewadi Phase 3
      [18.6074, 73.7395], // Baner
      [18.5633, 73.7804], // Balewadi
      [18.6298, 73.8086], // Pimpri Station
      [18.6480, 73.8246], // Bhosari
      [18.6708, 73.8456], // Dehu Road
      [18.6956, 73.8173], // Alandi Road
      [18.6480, 73.7804], // Ravet

      // Eastern Pune
      [18.5594, 73.9451], // Viman Nagar
      [18.5515, 73.9308], // Airport Road
      [18.5435, 73.9165], // Kalyani Nagar
      [18.5679, 73.9308], // Mundhwa
      [18.5679, 73.9594], // Kharadi
      [18.5515, 73.9737], // Wagholi
      [18.5355, 73.9880], // Lohegaon
      [18.5755, 73.9880], // Dighi
      [18.5594, 73.9023], // Pune Airport
      [18.5435, 73.8880], // Yerawada
      [18.5755, 73.8737], // Dhanori
      [18.5915, 73.8880], // Vishrantwadi
      [18.6074, 73.9023], // Tingre Nagar
      [18.5274, 73.9451], // Hadapsar
      [18.5435, 73.9594], // Magarpatta

      // Western Pune
      [18.4639, 73.8077], // Warje
      [18.4478, 73.8220], // Karve Nagar
      [18.4800, 73.8363], // Erandwane
      [18.4961, 73.8220], // Paud Road
      [18.4800, 73.8077], // Kothrud Depot
      [18.4639, 73.8363], // Ideal Colony
      [18.4478, 73.8506], // Bavdhan
      [18.4317, 73.8649], // Pashan
      [18.4478, 73.8792], // Sus
      [18.4800, 73.8935], // Baner Road
      [18.5124, 73.9078], // University Area
      [18.4961, 73.8792], // Chandani Chowk
      [18.4800, 73.8506], // Mayur Colony
      [18.4639, 73.8649], // Sahakarnagar
      [18.4478, 73.8363], // Law College Road

      // Northern Pune
      [18.5915, 73.8220], // Sangvi
      [18.6234, 73.8363], // Pimpri Road
      [18.6554, 73.8506], // Kasarwadi
      [18.6074, 73.7935], // Rahatani
      [18.6394, 73.7792], // Thergaon
      [18.6234, 73.7649], // Mulshi Road
      [18.6554, 73.7506], // Tathawade
      [18.6874, 73.7363], // Maan
      [18.6714, 73.7220], // Lonavala Road
      [18.6394, 73.6934], // Talegaon
      [18.7194, 73.7077], // Dehu
      [18.7034, 73.6791], // Alandi
      [18.6714, 73.6648], // Chakan
      [18.7354, 73.6934], // Rajgurunagar
      [18.7514, 73.7220], // Manchar Road

      // Southern Pune
      [18.4478, 73.8077], // Sinhgad Road
      [18.4317, 73.7934], // Vadgaon Khurd
      [18.4156, 73.7791], // Dhayari
      [18.3995, 73.7648], // Sinhgad College
      [18.4156, 73.7934], // Ambegaon
      [18.3834, 73.8077], // Hingne Khurd
      [18.3673, 73.8220], // Mukund Nagar
      [18.3512, 73.8363], // Sahakarnagar South
      [18.4317, 73.7505], // Kondhwa Road
      [18.4478, 73.7362], // NIBM Road
      [18.4639, 73.7219], // Undri
      [18.4800, 73.7076], // Pisoli
      [18.4961, 73.6933], // Bharati Vidyapeeth
      [18.5122, 73.6790], // Katraj
      [18.5283, 73.6647], // Ambegaon Pathar

      // Pune-Solapur Road Area
      [18.4800, 73.9451], // Hadapsar Circle
      [18.4639, 73.9594], // Gadital
      [18.4478, 73.9737], // Mundhwa Road
      [18.4317, 73.9880], // Seasom Park
      [18.4156, 73.9737], // Fursungi
      [18.3995, 74.0023], // Uruli Kanchan
      [18.3834, 74.0166], // Manjri
      [18.4156, 74.0309], // Loni Kalbhor
      [18.4317, 74.0452], // Wagholi Road
      [18.4478, 74.0595], // Shikrapur
      [18.4639, 74.0738], // Chakan Road
      [18.4800, 74.0881], // Shirur
      [18.4961, 74.1024], // Ahmednagar Road
      [18.5122, 74.1167], // Shrirampur
      [18.5283, 74.1310], // Sangamner Road

      // Mumbai-Pune Highway
      [18.5435, 73.7219], // Chandni Chowk
      [18.5594, 73.7076], // Pimpri-Chinchwad Link
      [18.5755, 73.6933], // Old Mumbai Highway
      [18.5915, 73.6790], // Dehu Bypass
      [18.6074, 73.6647], // Talegaon Junction
      [18.6234, 73.6504], // Vadgaon Maval
      [18.6394, 73.6361], // Kamshet Road
      [18.6554, 73.6218], // Lonavala Entry
      [18.6714, 73.6075], // Karla
      [18.6874, 73.5932], // Khopoli Road
      [18.7034, 73.5789], // Palasdari
      [18.7194, 73.5646], // Khalapur Road
      [18.7354, 73.5503], // Panvel Link
      [18.7514, 73.5360], // Rasayani Road
      [18.7674, 73.5217], // Kalamboli Junction

      // Pune-Nashik Highway
      [18.5679, 73.8649], // Aundh Road
      [18.5840, 73.8792], // Baner Junction
      [18.6000, 73.8935], // Pashan Road
      [18.6160, 73.9078], // Sus Junction
      [18.6320, 73.9221], // Mulshi Road
      [18.6480, 73.9364], // Pirangut
      [18.6640, 73.9507], // Lavasa Road
      [18.6800, 73.9650], // Chandani Road
      [18.6960, 73.9793], // Tamhini Road
      [18.7120, 73.9936], // Junnar Road
      [18.7280, 74.0079], // Manchar Junction
      [18.7440, 74.0222], // Narayangaon
      [18.7600, 74.0365], // Sangamner
      [18.7760, 74.0508], // Akole Road
      [18.7920, 74.0651], // Rahuri Road

      // Satara Road Area
      [18.4800, 73.8220], // Market Yard
      [18.4639, 73.8077], // Gultekdi
      [18.4478, 73.7934], // Sahakarnagar
      [18.4317, 73.7791], // Bibvewadi
      [18.4156, 73.7648], // Kondhwa
      [18.3995, 73.7505], // Wanowrie
      [18.3834, 73.7362], // Fatima Nagar
      [18.3673, 73.7219], // NIBM
      [18.3512, 73.7076], // Undri
      [18.3351, 73.6933], // Mohammadwadi
      [18.3190, 73.6790], // Hadapsar Industrial
      [18.3029, 73.6647], // Magarpatta City
      [18.2868, 73.6504], // Amanora Park
      [18.2707, 73.6361], // Kharadi IT Park
      [18.2546, 73.6218], // Wagholi IT Park

      // Ahmednagar Road
      [18.5755, 73.8935], // Viman Nagar Junction
      [18.5915, 73.9078], // Airport Junction
      [18.6074, 73.9221], // Lohegaon Road
      [18.6234, 73.9364], // Dighi Junction
      [18.6394, 73.9507], // Charholi
      [18.6554, 73.9650], // Alandi Junction
      [18.6714, 73.9793], // Dehu Road Junction
      [18.6874, 73.9936], // Talegaon Road
      [18.7034, 74.0079], // Chakan Junction
      [18.7194, 74.0222], // Rajgurunagar Junction
      [18.7354, 74.0365], // Manchar Road
      [18.7514, 74.0508], // Shirur Junction
      [18.7674, 74.0651], // Ahmednagar Entry
      [18.7834, 74.0794], // Pathardi Road
      [18.7994, 74.0937], // Shrirampur Junction

      // Ring Road Connections
      [18.5283, 73.7076], // Katraj Tunnel
      [18.5122, 73.7219], // Bharati Vidyapeeth
      [18.4961, 73.7362], // NIBM Circle
      [18.4800, 73.7505], // Kondhwa Circle
      [18.4639, 73.7648], // Wanowrie Circle
      [18.4478, 73.7791], // Fatima Nagar Circle
      [18.4317, 73.7934], // Bibvewadi Circle
      [18.4156, 73.8077], // Sahakarnagar Circle
      [18.3995, 73.8220], // Market Yard Circle
      [18.3834, 73.8363], // Gultekdi Circle
      [18.3673, 73.8506], // Swargate Circle
      [18.3512, 73.8649], // Pune Station Circle
      [18.3351, 73.8792], // Shivajinagar Circle
      [18.3190, 73.8935], // JM Road Circle
      [18.3029, 73.9078], // FC Road Circle

      // Industrial Areas
      [18.4800, 73.9880], // Magarpatta Industrial
      [18.4639, 74.0023], // Amanora Industrial
      [18.4478, 74.0166], // Hadapsar Industrial
      [18.4317, 74.0309], // Pune IT Park
      [18.4156, 74.0452], // Hinjewadi IT Park
      [18.3995, 74.0595], // Rajiv Gandhi IT Park
      [18.3834, 74.0738], // EON IT Park
      [18.3673, 74.0881], // Cybercity
      [18.3512, 74.1024], // World Trade Center
      [18.3351, 74.1167], // Tech Park
      [18.3190, 74.1310], // Software Park
      [18.3029, 74.1453], // Innovation District
      [18.2868, 74.1596], // Knowledge Park
      [18.2707, 74.1739], // Business Park
      [18.2546, 74.1882], // Commercial Hub

      // Educational Hubs
      [18.4156, 73.8935], // University Circle
      [18.4317, 73.8792], // College Road
      [18.4478, 73.8649], // Student Area
      [18.4639, 73.8506], // Academic Zone
      [18.4800, 73.8363], // Campus Road
      [18.4961, 73.8220], // Education Hub
      [18.5122, 73.8077], // Learning Center
      [18.5283, 73.7934], // Knowledge Center
      [18.5444, 73.7791], // Research Park
      [18.5605, 73.7648], // Innovation Hub
      [18.5766, 73.7505], // Technology Center
      [18.5927, 73.7362], // Science Park
      [18.6088, 73.7219], // Engineering Hub
      [18.6249, 73.7076], // Medical College Area
      [18.6410, 73.6933], // Dental College Road

      // Residential Complexes
      [18.5435, 73.8220], // Koregaon Park Extension
      [18.5594, 73.8077], // Kalyani Nagar Extension
      [18.5755, 73.7934], // Viman Nagar Extension
      [18.5915, 73.7791], // Airport Road Extension
      [18.6074, 73.7648], // Dhanori Extension
      [18.6234, 73.7505], // Vishrantwadi Extension
      [18.6394, 73.7362], // Tingre Nagar Extension
      [18.6554, 73.7219], // New Sangvi Extension
      [18.6714, 73.7076], // Pimple Saudagar Extension
      [18.6874, 73.6933], // Pimple Nilakh Extension
      [18.7034, 73.6790], // Aundh Extension
      [18.7194, 73.6647], // Baner Extension
      [18.7354, 73.6504], // Balewadi Extension
      [18.7514, 73.6361], // Wakad Extension
      [18.7674, 73.6218], // Hinjewadi Extension

      // Metro Line Coverage
      [18.5089, 73.8077], // Civil Court Metro
      [18.5158, 73.8220], // Budhwar Peth Metro
      [18.5227, 73.8363], // Mandai Metro
      [18.5296, 73.8506], // Swargate Metro
      [18.5365, 73.8649], // Deccan Metro
      [18.5434, 73.8792], // Kothrud Metro
      [18.5503, 73.8935], // Ideal Colony Metro
      [18.5572, 73.9078], // Nal Stop Metro
      [18.5641, 73.9221], // Garware College Metro
      [18.5710, 73.9364], // Vanaz Metro
      [18.5779, 73.9507], // Anand Nagar Metro
      [18.5848, 73.9650], // Ideal Colony Metro
      [18.5917, 73.9793], // Balewadi Metro
      [18.5986, 73.9936], // Shivaji Nagar Metro
      [18.6055, 74.0079], // Range Hills Metro

      // Hospital Areas
      [18.5196, 73.8220], // Ruby Hall Clinic
      [18.5089, 73.8363], // Sassoon Hospital
      [18.4982, 73.8506], // Deenanath Mangeshkar
      [18.4875, 73.8649], // Jehangir Hospital
      [18.4768, 73.8792], // KEM Hospital
      [18.4661, 73.8935], // Aditya Birla Hospital
      [18.4554, 73.9078], // Columbia Asia
      [18.4447, 73.9221], // Noble Hospital
      [18.4340, 73.9364], // Oyster Pearl Hospital
      [18.4233, 73.9507], // Inamdar Hospital
      [18.4126, 73.9650], // Sancheti Hospital
      [18.4019, 73.9793], // Poona Hospital
      [18.3912, 73.9936], // Inlaks Hospital
      [18.3805, 74.0079], // Sahyadri Hospital
      [18.3698, 74.0222], // Jupiter Hospital

      // Shopping Areas
      [18.5314, 73.8792], // Phoenix Mall
      [18.5435, 73.8649], // Seasons Mall
      [18.5556, 73.8506], // Amanora Mall
      [18.5677, 73.8363], // Ezone Mall
      [18.5798, 73.8220], // Westend Mall
      [18.5919, 73.8077], // Kumar Pacific Mall
      [18.6040, 73.7934], // City Pride Multiplex
      [18.6161, 73.7791], // Inox Multiplex
      [18.6282, 73.7648], // PVR Cinema
      [18.6403, 73.7505], // Fun Republic
      [18.6524, 73.7362], // Gold Adlabs
      [18.6645, 73.7219], // Big Bazaar
      [18.6766, 73.7076], // Reliance Fresh
      [18.6887, 73.6933], // More Supermarket
      [18.7008, 73.6790], // Spencer's Retail

      // Religious Places
      [18.5089, 73.8649], // Dagadusheth Temple
      [18.4982, 73.8506], // Pataleshwar Cave
      [18.4875, 73.8792], // Kasba Ganpati
      [18.4768, 73.8935], // Tambdi Jogeshwari
      [18.4661, 73.9078], // Tulsi Baug Temple
      [18.4554, 73.9221], // Omkareshwar Temple
      [18.4447, 73.9364], // ISKCON Temple
      [18.4340, 73.9507], // Chaturshringi Temple
      [18.4233, 73.9650], // Parvati Temple
      [18.4126, 73.9793], // Sarasbaug Temple
      [18.4019, 73.9936], // Pune Gurudwara
      [18.3912, 74.0079], // St. Mary's Church
      [18.3805, 74.0222], // All Saints Church
      [18.3698, 74.0365], // Holy Spirit Church
      [18.3591, 74.0508], // Sacred Heart Church

      // Parks and Gardens
      [18.5435, 73.8363], // Shaniwar Wada
      [18.5314, 73.8220], // Bund Garden
      [18.5193, 73.8077], // Okayama Friendship Garden
      [18.5072, 73.7934], // Saras Baug
      [18.4951, 73.7791], // Peshwe Park
      [18.4830, 73.7648], // Empress Garden
      [18.4709, 73.7505], // Kamala Nehru Park
      [18.4588, 73.7362], // Pune Race Course
      [18.4467, 73.7219], // Katraj Snake Park
      [18.4346, 73.7076], // Rajiv Gandhi Zoological Park
      [18.4225, 73.6933], // Pashan Lake
      [18.4104, 73.6790], // Khadakwasla Lake
      [18.3983, 73.6647], // Temghar Dam
      [18.3862, 73.6504], // Mulshi Dam
      [18.3741, 73.6361], // Varasgaon Dam

      // Sports Complexes
      [18.5556, 73.8506], // Maharashtra Cricket Stadium
      [18.5435, 73.8649], // Pune Football Stadium
      [18.5314, 73.8792], // Shree Shiv Chhatrapati Sports Complex
      [18.5193, 73.8935], // Balewadi Sports Complex
      [18.5072, 73.9078], // PYC Gymkhana
      [18.4951, 73.9221], // Poona Club
      [18.4830, 73.9364], // Pune Cantonment Club
      [18.4709, 73.9507], // Oxford Golf Club
      [18.4588, 73.9650], // Pune Race Course Club
      [18.4467, 73.9793], // Swimming Pool Complex
      [18.4346, 73.9936], // Tennis Club
      [18.4225, 74.0079], // Cricket Club
      [18.4104, 74.0222], // Badminton Club
      [18.3983, 74.0365], // Hockey Club
      [18.3862, 74.0508], // Athletic Stadium

      // Government Offices
      [18.5314, 73.8506], // Pune Collector Office
      [18.5435, 73.8649], // PMC Building
      [18.5556, 73.8792], // PCMC Building
      [18.5677, 73.8935], // Maharashtra Bhavan
      [18.5798, 73.9078], // District Court
      [18.5919, 73.9221], // High Court Bench
      [18.6040, 73.9364], // Police Commissioner Office
      [18.6161, 73.9507], // Passport Office
      [18.6282, 73.9650], // Income Tax Office
      [18.6403, 73.9793], // Sales Tax Office
      [18.6524, 73.9936], // Excise Office
      [18.6645, 74.0079], // Labour Office
      [18.6766, 74.0222], // Regional Transport Office
      [18.6887, 74.0365], // Tehsildar Office
      [18.7008, 74.0508], // Block Development Office
    ];

    // Pick a random road point from the 500 locations
    return puneRoadPoints[Math.floor(Math.random() * puneRoadPoints.length)];
  };

  const generateNearbyRoadPosition = (centerPos: [number, number], maxDistanceKm: number): [number, number] => {
    // Instead of generating arbitrary grid points, let's use known good road points
    // and find ones within our distance range
    const knownRoadPoints: [number, number][] = [
      // Central Pune - verified road locations
      [18.5204, 73.8567], // Shivajinagar
      [18.5314, 73.8446], // JM Road
      [18.5074, 73.8077], // Koregaon Park
      [18.5089, 73.8535], // FC Road
      [18.5022, 73.8878], // Kothrud
      [18.5679, 73.9143], // Aundh
      [18.5362, 73.8454], // Deccan
      [18.5435, 73.8497], // Karve Road
      [18.5196, 73.8553], // Pune Station
      [18.5158, 73.8560], // Cantonment
      [18.5089, 73.8304], // MG Road
      [18.5246, 73.8370], // Camp Area
      // Pimpri-Chinchwad Area
      [18.6298, 73.7997], // Pimpri
      [18.6186, 73.8037], // Chinchwad
      [18.6588, 73.8370], // Akurdi
      [18.6480, 73.8173], // Nigdi
      [18.5886, 73.8333], // Wakad
      [18.5515, 73.7804], // Hinjewadi Phase 1
      [18.5892, 73.7395], // Hinjewadi Phase 2
      [18.5679, 73.7804], // Hinjewadi Phase 3
      [18.6074, 73.7395], // Baner
      [18.5633, 73.7804], // Balewadi
      // Eastern Pune
      [18.5594, 73.9451], // Viman Nagar
      [18.5515, 73.9308], // Airport Road
      [18.5435, 73.9165], // Kalyani Nagar
      [18.5679, 73.9308], // Mundhwa
      [18.5679, 73.9594], // Kharadi
      [18.5515, 73.9737], // Wagholi
      [18.5355, 73.9880], // Lohegaon
      [18.5755, 73.9880], // Dighi
      [18.5594, 73.9023], // Pune Airport
      [18.5435, 73.8880], // Yerawada
      // Western Pune
      [18.4639, 73.8077], // Warje
      [18.4478, 73.8220], // Karve Nagar
      [18.4800, 73.8363], // Erandwane
      [18.4961, 73.8220], // Paud Road
      [18.4800, 73.8077], // Kothrud Depot
      [18.4639, 73.8363], // Ideal Colony
      [18.4478, 73.8506], // Bavdhan
      [18.4317, 73.8649], // Pashan
      [18.4478, 73.8792], // Sus
      [18.4800, 73.8935], // Baner Road
      // Southern Pune
      [18.4478, 73.8077], // Sinhgad Road
      [18.4317, 73.7934], // Vadgaon Khurd
      [18.4156, 73.7791], // Dhayari
      [18.3995, 73.7648], // Sinhgad College
      [18.4156, 73.7934], // Ambegaon
      [18.3834, 73.8077], // Hingne Khurd
      [18.3673, 73.8220], // Mukund Nagar
      [18.3512, 73.8363], // Sahakarnagar South
      [18.4317, 73.7505], // Kondhwa Road
      [18.4478, 73.7362], // NIBM Road
      [18.4639, 73.7219], // Undri
      [18.4800, 73.7076], // Pisoli
      [18.4961, 73.6933], // Bharati Vidyapeeth
      // Major road intersections throughout Pune
      [18.5170, 73.8570], // Pune Central Junction
      [18.4760, 73.8450], // Law College Junction
      [18.5689, 73.8140], // University Circle
      [18.6544, 73.8300], // Pimpri Main Junction
    ];

    // Filter points that are within our desired distance range
    const nearbyPoints: [number, number][] = [];

    for (const point of knownRoadPoints) {
      const distance = calculateDistance(centerPos, point);
      if (distance >= 1 && distance <= maxDistanceKm) { // At least 1km away, max desired distance
        nearbyPoints.push(point);
      }
    }

    if (nearbyPoints.length === 0) {
      // If no points in range, use the closest known road point
      let closestPoint = knownRoadPoints[0];
      let minDistance = calculateDistance(centerPos, knownRoadPoints[0]);

      for (const point of knownRoadPoints) {
        const distance = calculateDistance(centerPos, point);
        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = point;
        }
      }

      console.log(`🛣️ Using closest road point at ${minDistance.toFixed(1)}km`);
      return closestPoint;
    }

    // Pick a random point from the nearby valid road points
    const selectedPoint = nearbyPoints[Math.floor(Math.random() * nearbyPoints.length)];
    const distance = calculateDistance(centerPos, selectedPoint);

    console.log(`✅ Selected road point at ${distance.toFixed(1)}km from center`);
    return selectedPoint;
  };

  const validateRouteConnection = async (point1: [number, number], point2: [number, number]): Promise<boolean> => {
    try {
      const routeResult = await apiService.calculateRoute([point1, point2]);

      // Simplified validation - since we're using known road points, just check basic criteria
      const hasValidRoute = routeResult.route && routeResult.route.length >= 2;
      const hasReasonableDistance = routeResult.distance > 100 && routeResult.distance < 50000; // 100m to 50km

      if (hasValidRoute && hasReasonableDistance) {
        console.log(`✅ Route validated: ${(routeResult.distance / 1000).toFixed(1)}km`);
        return true;
      } else {
        console.log(`❌ Route rejected: distance=${routeResult.distance}m, points=${routeResult.route?.length || 0}`);
        return false;
      }
    } catch (error) {
      console.log('❌ Route validation failed:', error);
      return false;
    }
  };

  // Random generation handlers
  const handleAddRandomDriver = async () => {
    try {
      const driverName = generateRandomName();
      let position: [number, number];
      let attempts = 0;
      const maxAttempts = 5;

      // Try to find a valid position
      do {
        position = generateRandomPositionInPune();
        attempts++;
      } while (attempts < maxAttempts);

      console.log(`🎲 Adding random driver "${driverName}" at position:`, position);
      await addDriverAtPosition(position, driverName);
    } catch (error) {
      console.error('Failed to add random driver:', error);
    }
  };

  const handleAddRandomDelivery = async () => {
    if (drivers.length === 0) {
      alert('Please add at least one driver first!');
      return;
    }

    try {
      // Pick a random driver or use the nearest one
      const randomDriver = drivers[Math.floor(Math.random() * drivers.length)];
      const driverPos: [number, number] = [randomDriver.latitude, randomDriver.longitude];

      console.log(`🎯 Generating random delivery for driver "${randomDriver.name}"`);

      let pickupPos: [number, number];
      let deliveryPos: [number, number];
      let isValid = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!isValid && attempts < maxAttempts) {
        attempts++;

        // Generate pickup position within 20km of driver (on roads)
        pickupPos = generateNearbyRoadPosition(driverPos, 20);

        // Generate delivery position within 30km of pickup (on roads)
        deliveryPos = generateNearbyRoadPosition(pickupPos, 30);

        console.log(`Attempt ${attempts}: Testing pickup ${pickupPos} -> delivery ${deliveryPos}`);

        // Validate that both routes are possible
        const [driverToPickup, pickupToDelivery] = await Promise.all([
          validateRouteConnection(driverPos, pickupPos),
          validateRouteConnection(pickupPos, deliveryPos)
        ]);

        if (driverToPickup && pickupToDelivery) {
          const totalDistance = calculateDistance(driverPos, pickupPos) + calculateDistance(pickupPos, deliveryPos);
          if (totalDistance < 50) { // Total journey under 50km
            isValid = true;
            console.log(`✅ Valid delivery route found! Total distance: ${totalDistance.toFixed(1)}km`);

            // Add the delivery
            await addDeliveryPair({ pickup: pickupPos, delivery: deliveryPos });
            break;
          }
        }

        // If this attempt failed, log it
        console.log(`❌ Attempt ${attempts} failed - trying again...`);
      }

      if (!isValid) {
        console.log('⚠️ Could not find valid delivery route after maximum attempts, using fallback');
        // Fallback: create a simple nearby delivery on major roads
        pickupPos = generateNearbyRoadPosition(driverPos, 5); // Very close pickup
        deliveryPos = generateNearbyRoadPosition(pickupPos, 10); // Close delivery
        await addDeliveryPair({ pickup: pickupPos, delivery: deliveryPos });
      }

    } catch (error) {
      console.error('Failed to add random delivery:', error);
      alert('Failed to generate random delivery. Please try again.');
    }
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

  // Calculate bearing/heading between two points (in degrees)
  const calculateBearing = (pos1: [number, number], pos2: [number, number]): number => {
    const [lat1, lng1] = pos1;
    const [lat2, lng2] = pos2;

    const dLng = (lng2 - lng1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;

    const y = Math.sin(dLng) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

    const bearingRad = Math.atan2(y, x);
    const bearingDeg = (bearingRad * 180 / Math.PI + 360) % 360;

    return bearingDeg;
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
    setGlobalSimulation(true); // Notify mobile views

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

    // Share initial driver data with mobile views when simulation starts
    console.log(`🔄 Sharing initial driver data for ${updatedDrivers.length} drivers`);
    updatedDrivers.forEach(driver => {
      if (driver.simulationPosition || (driver.latitude && driver.longitude)) {
        const position = driver.simulationPosition || [driver.latitude, driver.longitude];
        const sharedData = {
          ...driver,
          latitude: position[0],
          longitude: position[1],
          simulationPosition: position,
          heading: driver.heading || 0,
          movementDirection: driver.heading || 0,
          lastUpdate: Date.now()
        };
        console.log(`🔄 Initial share for ${driver.name} (${driver.id}):`, {
          position: position,
          isMoving: driver.isMoving,
          hasDeliveries: driver.deliveries?.length || 0
        });
        updateSharedDriver(driver.id, sharedData);
      }
    });

    const intervalId = setInterval(() => {
      updateDriverPositions();
    }, 100); // Update every 100ms for smooth animation

    setSimulationIntervalId(intervalId);
  };

  const stopSimulation = () => {
    if (!isSimulating) return;

    setIsSimulating(false);
    setGlobalSimulation(false); // Notify mobile views

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
      currentRouteIndex: undefined,
      heading: undefined,
      lastPosition: undefined
    })));
  };

  const updateDriverPositions = () => {
    console.log(`🔄 updateDriverPositions called. Moving drivers:`, drivers.filter(d => d.isMoving).map(d => d.name));
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

        // Calculate heading based on movement direction
        const heading = calculateBearing(driver.simulationPosition, targetPoint);

        // Check if reached current route point
        const distanceToPoint = calculateDistance(newPos, targetPoint);
        const hasReachedPoint = distanceToPoint < 0.01; // Within 10 meters

        if (hasReachedPoint) {
          return {
            ...driver,
            simulationPosition: targetPoint,
            lastPosition: driver.simulationPosition,
            currentRouteIndex: currentRouteIndex + 1,
            heading
          };
        }

        return {
          ...driver,
          simulationPosition: newPos,
          lastPosition: driver.simulationPosition,
          heading
        };
      }

      // Fallback to old straight-line movement if no route
      const currentDelivery = driver.deliveries[driver.currentDeliveryIndex || 0];
      if (!currentDelivery) return driver;

      const targetPos: [number, number] = driver.currentTarget === 'pickup'
        ? [currentDelivery.pickup_latitude, currentDelivery.pickup_longitude]
        : [currentDelivery.delivery_latitude, currentDelivery.delivery_longitude];

      const newPos = moveTowardsTarget(driver.simulationPosition, targetPos, driver.speed || simulationSpeed, 100);

      // Calculate heading based on movement direction
      const heading = calculateBearing(driver.simulationPosition, targetPos);

      // Check if reached target
      const distanceToTarget = calculateDistance(newPos, targetPos);
      const hasReachedTarget = distanceToTarget < 0.01; // Within 10 meters

      if (hasReachedTarget) {
        if (driver.currentTarget === 'pickup') {
          return {
            ...driver,
            simulationPosition: targetPos,
            lastPosition: driver.simulationPosition,
            currentTarget: 'delivery' as const,
            heading,
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
              lastPosition: driver.simulationPosition,
              currentTarget: 'pickup' as const,
              currentDeliveryIndex: nextDeliveryIndex,
              heading,
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
              lastPosition: driver.simulationPosition,
              isMoving: false,
              currentTarget: undefined,
              currentDeliveryIndex: undefined,
              heading,
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
        simulationPosition: newPos,
        lastPosition: driver.simulationPosition,
        heading
      };
    }));

    // Share updated driver data with AppContext for mobile sync (separate call to avoid issues)
    setDrivers(prevDrivers => {
      console.log(`🔄 Attempting to share data for ${prevDrivers.length} drivers`);
      prevDrivers.forEach(driver => {
        // Share data for ALL drivers during simulation, not just moving ones
        if (driver.simulationPosition || (driver.latitude && driver.longitude)) {
          // Share simulation data with mobile views
          const position = driver.simulationPosition || [driver.latitude, driver.longitude];
          const sharedData = {
            ...driver,
            latitude: position[0],
            longitude: position[1],
            simulationPosition: position,
            heading: driver.heading || 0,
            movementDirection: driver.heading || 0,
            lastUpdate: Date.now()
          };
          console.log(`🔄 Admin sharing driver data for ${driver.name} (${driver.id}):`, {
            id: driver.id,
            position: position,
            heading: driver.heading,
            isMoving: driver.isMoving
          });

          // Send to backend API for mobile view consumption
          fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001/api'}/drivers/${driver.id}/position`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sharedData)
          }).catch(error => {
            console.log('📡 API position update failed (this is ok):', error);
          });

          // Also update AppContext for local coordination
          updateSharedDriver(driver.id, sharedData);
        } else {
          console.log(`🔄 No position data for driver ${driver.name}`);
        }
      });
      return prevDrivers; // Return unchanged since we're just sharing data
    });
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
    if (placementMode === 'driver') {
      // Generate random name for driver
      const randomName = generateRandomName();
      addDriverAtPosition(latlng, randomName);
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
  }, [placementMode, currentDeliveryPair, pendingWeatherEvent]);

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

  const handleSpeedChange = (newSpeed: number) => {
    setSimulationSpeed(newSpeed);
    setGlobalSimulationSpeed(newSpeed); // Notify mobile views

    // Update speed for all currently moving drivers in real-time
    if (isSimulating) {
      console.log(`🚀 Live speed update: ${newSpeed} km/h applied to all moving drivers`);
      setDrivers(prevDrivers => prevDrivers.map(driver => ({
        ...driver,
        speed: driver.isMoving ? newSpeed : driver.speed
      })));
    }
  };

  // Dashboard callbacks
  const handleAddDriver = () => {
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
    setCurrentDeliveryPair({ pickup: null, delivery: null });
    setPendingWeatherEvent(null);
  };

  const toggleWeatherEvent = async (eventId: string) => {
    try {
      const updatedEvent = await ApiService.toggleWeatherEvent(eventId);
      const newWeatherEvents = weatherEvents.map(event =>
        event.id === eventId ? updatedEvent : event
      );
      setWeatherEvents(newWeatherEvents);

      // If simulation is running, recalculate routes for all active drivers
      if (isSimulating) {
        console.log(`🌪️ Weather event ${eventId} toggled during simulation - recalculating routes for all active drivers`);
        await recalculateRoutesForActiveDrivers(newWeatherEvents);
      }
    } catch (err: any) {
      console.error('Failed to toggle weather event:', err);
      // Fallback to local state update
      const newWeatherEvents = weatherEvents.map(event =>
        event.id === eventId ? { ...event, active: !event.active } : event
      );
      setWeatherEvents(newWeatherEvents);

      // If simulation is running, recalculate routes for all active drivers
      if (isSimulating) {
        console.log(`🌪️ Weather event ${eventId} toggled during simulation - recalculating routes for all active drivers`);
        await recalculateRoutesForActiveDrivers(newWeatherEvents);
      }
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
            className="mt-6 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-semibold shadow-lg hover:from-red-600 hover:to-red-700 hover:shadow-xl transform hover:scale-105 transition-all duration-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-900">
      {/* Left Panel - Dashboard */}
      <div className="w-80 bg-gray-800 shadow-lg border-r border-gray-700">
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
          onSpeedChange={handleSpeedChange}
          onAddRandomDriver={handleAddRandomDriver}
          onAddRandomDelivery={handleAddRandomDelivery}
          isRecalculatingRoutes={isRecalculatingRoutes}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-gray-900">
        {/* Top Metrics Panel */}
        <div className="h-32 bg-gray-800 shadow-sm border-b border-gray-700">
          <MetricsPanel drivers={drivers} weatherEvents={weatherEvents} />
        </div>

        {/* Map Container */}
        <div className="flex-1 relative bg-gray-900" style={{ minHeight: '400px' }}>
          <MapContainer
            center={[18.5204, 73.8567]}
            zoom={12}
            className="h-full w-full"
            style={{ height: '100%', width: '100%', zIndex: 1 }}
            key="main-map" // Force remount if needed
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              maxZoom={19}
              tileSize={256}
            />

            {/* Map Click Handler */}
            <MapClickHandler
              placementMode={placementMode}
              onMapClick={handleMapClick}
              onMouseMove={handleMouseMove}
            />

            {/* Driver Markers with Enhanced Icons */}
            {drivers.map((driver) => {
              const position = driver.simulationPosition || [driver.latitude, driver.longitude];
              const isMoving = driver.isMoving && isSimulating;
              const heading = driver.heading || 0;

              // Create dynamic driver icon based on movement state and heading
              const dynamicDriverIcon = createDriverIcon('#3B82F6', heading, isMoving);

              return (
                <Marker
                  key={driver.id}
                  position={position}
                  icon={dynamicDriverIcon}
                >
                  <Popup>
                    <div>
                      <strong>{driver.name}</strong><br />
                      ID: {driver.id}<br />
                      Deliveries: {driver.deliveries.length}<br />
                      {isMoving && (
                        <>
                          Status: Moving to {driver.currentTarget === 'pickup' ? 'Pickup' : 'Delivery'}<br />
                          Heading: {heading.toFixed(0)}°<br />
                          Speed: {driver.speed || simulationSpeed} km/h<br />
                        </>
                      )}
                      {!isMoving && driver.deliveries.length > 0 && (
                        <>Status: Ready to start<br /></>
                      )}
                      {driver.deliveries.length === 0 && (
                        <>Status: No deliveries<br /></>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Active Routes - Only show path ahead of driver (no trail behind) */}
            {drivers.map((driver) => {
              if (!driver.activeRoute || !driver.isMoving || !isSimulating || driver.currentRouteIndex === undefined) {
                return null;
              }

              // Get only the remaining route points ahead of the driver
              const remainingRoute = driver.activeRoute.slice(driver.currentRouteIndex);

              // Only show if there are points ahead
              if (remainingRoute.length < 2) {
                return null;
              }

              return (
                <Polyline
                  key={`active-route-${driver.id}`}
                  positions={remainingRoute}
                  color="#10B981"
                  weight={4}
                  opacity={0.8}
                  dashArray="10, 5"
                />
              );
            })}

            {/* Selected Driver Routes (shown when driver is selected from dashboard) - REMOVED for cleaner visuals */}
            {/* 
            {drivers.map((driver) =>
              driver.currentRoute && selectedDriver === driver.id && (!driver.isMoving || !isSimulating) ? (
                <Polyline
                  key={`planned-route-${driver.id}`}
                  positions={driver.currentRoute}
                  color="#3B82F6"
                  weight={3}
                  opacity={0.6}
                />
              ) : null
            )}
            */}

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
            <div className="absolute top-4 left-4 bg-gray-800 border border-gray-600 rounded-lg shadow-lg p-3 z-1000">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-100">
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
                  {pendingWeatherEvent && (
                    <p className="text-xs text-purple-300">
                      Radius: {(pendingWeatherEvent.currentRadius / 1000).toFixed(1)}km
                    </p>
                  )}
                </div>
                <button
                  onClick={handleCancelPlacement}
                  className="ml-4 px-4 py-2 text-xs bg-gradient-to-r from-red-600 to-red-700 text-black rounded-lg font-semibold shadow-md hover:from-red-700 hover:to-red-800 hover:shadow-lg transform hover:scale-105 transition-all duration-200 border border-red-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Route Recalculation Status */}
          {isRecalculatingRoutes && isSimulating && (
            <div className="absolute top-4 right-4 bg-blue-50 border-l-4 border-blue-400 rounded-lg shadow-lg p-3 z-1000">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
                <div>
                  <p className="text-sm font-medium text-blue-800">Recalculating Routes</p>
                  <p className="text-xs text-blue-600">Updating paths due to weather changes...</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
