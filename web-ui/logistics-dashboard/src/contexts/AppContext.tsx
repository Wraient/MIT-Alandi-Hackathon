import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// Driver interface for simulation data (matches ExtendedDriver from App.tsx)
interface SimulatedDriver {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    deliveries: any[];
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
    movementDirection?: number; // For mobile view compatibility
    [key: string]: any;
}

interface AppState {
    selectedDriverId: string | null;
    isAppActive: boolean;
    syncMode: boolean; // Whether mobile should sync with admin
    sharedDrivers: { [key: string]: SimulatedDriver }; // Shared simulation state
    isSimulating: boolean; // Global simulation state
    simulationSpeed: number; // Global simulation speed
}

interface AppContextType {
    appState: AppState;
    setSelectedDriverId: (driverId: string | null) => void;
    setAppActive: (active: boolean) => void;
    setSyncMode: (sync: boolean) => void;
    updateSharedDriver: (driverId: string, driverData: SimulatedDriver) => void;
    getSharedDriver: (driverId: string) => SimulatedDriver | undefined;
    setGlobalSimulation: (isSimulating: boolean) => void;
    setGlobalSimulationSpeed: (speed: number) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

interface AppProviderProps {
    children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
    const [appState, setAppState] = useState<AppState>({
        selectedDriverId: null,
        isAppActive: true,
        syncMode: false,
        sharedDrivers: {},
        isSimulating: false,
        simulationSpeed: 50
    });

    const setSelectedDriverId = useCallback((driverId: string | null) => {
        setAppState(prev => ({ ...prev, selectedDriverId: driverId }));
    }, []);

    const setAppActive = useCallback((active: boolean) => {
        setAppState(prev => ({ ...prev, isAppActive: active }));
    }, []);

    const setSyncMode = useCallback((sync: boolean) => {
        setAppState(prev => ({ ...prev, syncMode: sync }));
    }, []);

    const updateSharedDriver = useCallback((driverId: string, driverData: SimulatedDriver) => {
        setAppState(prev => ({
            ...prev,
            sharedDrivers: {
                ...prev.sharedDrivers,
                [driverId]: driverData
            }
        }));
    }, []);

    const getSharedDriver = useCallback((driverId: string): SimulatedDriver | undefined => {
        return appState.sharedDrivers[driverId];
    }, [appState.sharedDrivers]);

    const setGlobalSimulation = useCallback((isSimulating: boolean) => {
        setAppState(prev => ({ ...prev, isSimulating }));
    }, []);

    const setGlobalSimulationSpeed = useCallback((speed: number) => {
        setAppState(prev => ({ ...prev, simulationSpeed: speed }));
    }, []);

    const value: AppContextType = {
        appState,
        setSelectedDriverId,
        setAppActive,
        setSyncMode,
        updateSharedDriver,
        getSharedDriver,
        setGlobalSimulation,
        setGlobalSimulationSpeed
    };

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};
