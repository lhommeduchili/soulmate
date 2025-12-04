import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import JobView from './pages/JobView';
import Candidates from './pages/Candidates';
import { setToken } from './utils/auth';
import './index.css';

// Component to handle auth callback logic
function AuthHandler({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const authData = params.get('auth_data');

        if (authData) {
            try {
                // Decode base64 (account for "+" getting turned into spaces)
                const normalized = authData.replace(/ /g, '+');
                const jsonStr = atob(normalized);
                const tokenInfo = JSON.parse(jsonStr);

                // Save to local storage
                setToken(tokenInfo);
        console.log("Token saved successfully");

        // Clear URL and redirect to dashboard (root)
        navigate('/', { replace: true });
      } catch (e) {
        console.error("Failed to parse auth data", e);
      }
    }
  }, [location, navigate]);

  return children;
}

function App() {
  return (
    <Router>
      <AuthHandler>
        <div className="min-h-screen bg-gray-900 text-white font-sans selection:bg-green-500 selection:text-black">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Dashboard />} />
            <Route path="/inspect/:playlistId" element={<Candidates />} />
            <Route path="/job/:jobId" element={<JobView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </AuthHandler>
    </Router>
  );
}

export default App;
