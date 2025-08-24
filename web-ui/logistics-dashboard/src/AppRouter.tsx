import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import App from './App';
import DriverMobileView from './components/DriverMobileView';

const AppRouter: React.FC = () => {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<App />} />
                <Route path="/driver" element={<DriverMobileView />} />
            </Routes>
        </Router>
    );
};

export default AppRouter;
