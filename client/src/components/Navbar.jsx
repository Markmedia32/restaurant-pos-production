import React from 'react';
import { Bell, UserCircle, Search, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Navbar = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));

  const handleLogout = () => {
    localStorage.removeItem('user'); // Clear user data
    navigate('/', { replace: true }); // Send to login
  };

  return (
    <header className="main-navbar">
      <div className="nav-search">
        <Search size={18} className="search-icon" />
        <input type="text" placeholder="Search transactions..." />
      </div>

      <div className="nav-actions">
        <div className="api-status">
          <span className="status-label">M-PESA:</span>
          <span className="status-value">CONNECTED</span>
        </div>
        
        <button className="icon-btn">
          <Bell size={20} />
          <span className="notification-dot"></span>
        </button>

        <div className="user-profile">
          <div className="user-info">
            <span className="user-name">{user?.username || 'Guest'}</span>
            <span className="user-role">{user?.role || 'User'}</span>
          </div>
          <UserCircle size={32} strokeWidth={1.5} />
        </div>

        {/* LOGOUT BUTTON */}
        <button className="logout-btn" onClick={handleLogout} title="Logout">
          <LogOut size={20} />
        </button>
      </div>
    </header>
  );
};

export default Navbar;