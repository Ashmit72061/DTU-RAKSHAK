import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Car, Camera, ClipboardList, LogOut, X } from 'lucide-react';
import { logout } from '../api';

const nav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/vehicles', icon: Car, label: 'Vehicles' },
  { to: '/cameras', icon: Camera, label: 'Cameras' },
  { to: '/logs', icon: ClipboardList, label: 'Entry/Exit Logs' },
];

export default function Sidebar({ isOpen, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const email = localStorage.getItem('email') || 'admin@dtu.ac.in';
  const initials = email[0].toUpperCase();

  async function handleLogout() {
    try { await logout(); } catch { }
    localStorage.clear();
    navigate('/login');
  }

  function handleNavClick() {
    // Close sidebar on mobile when a nav link is clicked
    if (onClose) onClose();
  }

  return (
    <>
      {/* Backdrop overlay for mobile */}
      <div
        className={`sidebar-backdrop ${isOpen ? 'visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <button className="sidebar-close-btn" onClick={onClose} aria-label="Close sidebar">
          <X size={20} />
        </button>

        <div className="sidebar-logo">
          <img src="/dtu-logo.png" alt="DTU" />
          <div className="sidebar-logo-text">
            <h2>DTU Rakshak</h2>
            <span>Campus Security</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">Main</div>
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={handleNavClick}
            >
              <Icon /> {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <h4>Admin</h4>
              <span>DTU Campus</span>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
