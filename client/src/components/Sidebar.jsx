import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutGrid, ClipboardList, BarChart3, Settings, Package } from 'lucide-react';

const Sidebar = () => {
  // Retrieve the logged-in user from localStorage
  const user = JSON.parse(localStorage.getItem('user'));

  const menuItems = [
    { name: 'POS Terminal', path: '/pos', icon: <LayoutGrid size={20} /> },
    { name: 'Inventory', path: '/inventory', icon: <Package size={20} /> },
    { name: 'Sales Reports', path: '/sales', icon: <BarChart3 size={20} /> },
    { name: 'Accounts Management', path: '/Accounts', icon: <ClipboardList size={20} /> },
    { name: 'System Settings', path: '/settings', icon: <Settings size={20} /> },
  ];

  // Logic to hide "System Settings" from anyone who isn't an Admin
  const filteredItems = menuItems.filter(item => {
    if (item.path === '/settings') {
      return user?.role === 'Admin';
    }
    return true;
  });

  return (
    <aside className="sidebar-container">
      <div className="sidebar-brand">
        <div className="brand-icon-box">FC</div>
        <span>First Class</span>
      </div>

      <nav className="sidebar-nav">
        {filteredItems.map((item) => (
          <NavLink 
            to={item.path} 
            key={item.name} 
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="status-indicator">
          <div className="dot"></div>
          {/* Optional: Show the username/role in the footer */}
          <span style={{ fontSize: '10px', marginLeft: '8px', color: '#888' }}>
            {user?.username} ({user?.role})
          </span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;