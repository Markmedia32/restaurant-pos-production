import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Pos from './pages/Pos';
import Sales from './pages/Sales';
import Inventory from './pages/Inventory';
import '../src/Main.css';
import Settings from './pages/Settings';
import Accounts from './pages/Accounts';

// --- Step 3: Authentication Guard Component ---
const ProtectedRoute = ({ children }) => {
  const user = JSON.parse(localStorage.getItem('user'));
  
  // Strict check: No user or invalid object results in redirect
  if (!user || !user.role) {
    return <Navigate to="/" replace />;
  }
  
  return children;
};

const LayoutWrapper = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isLoginPage = location.pathname === "/";
  const user = JSON.parse(localStorage.getItem('user'));

  // Immediate Redirect Logic:
  // If we are NOT on the login page and no valid user session exists, kick to login.
  useEffect(() => {
    if (!isLoginPage && (!user || !user.role)) {
      navigate('/', { replace: true });
    }
  }, [isLoginPage, user, navigate]);

  // Don't show sidebar/navbar on the Login page
  if (isLoginPage) return <>{children}</>;

  // If there's no user and we aren't on login page, don't render dashboard UI at all
  if (!user) return null;

  return (
    <div className="dashboard-wrapper">
      <Sidebar />
      <div className="main-content-area">
        <Navbar />
        <main className="page-viewport">
          {children}
        </main>
      </div>
    </div>
  );
};

function App() {
  return (
    <Router>
      <LayoutWrapper>
        <Routes>
          {/* Public Route */}
          <Route path="/" element={<Login />} />
          
          {/* Protected Routes */}
          <Route 
            path="/pos" 
            element={<ProtectedRoute><Pos /></ProtectedRoute>} 
          />
          <Route 
            path="/inventory" 
            element={<ProtectedRoute><Inventory /></ProtectedRoute>} 
          />
          <Route 
            path="/sales" 
            element={<ProtectedRoute><Sales /></ProtectedRoute>} 
          />
          <Route 
            path="/Accounts" 
            element={<ProtectedRoute><Accounts /></ProtectedRoute>} 
          />
          <Route 
            path="/settings" 
            element={<ProtectedRoute><Settings /></ProtectedRoute>} 
          />
          
          {/* Catch-all: Redirect unknown paths to login or POS */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </LayoutWrapper>
    </Router>
  );
}

export default App;