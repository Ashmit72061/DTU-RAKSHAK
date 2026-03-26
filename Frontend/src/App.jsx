import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import MobileHeader from './components/MobileHeader';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import Cameras from './pages/Cameras';
import Logs from './pages/Logs';

function PrivateLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="layout">
      <MobileHeader onToggleSidebar={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {children}
    </div>
  );
}

function RequireAuth({ children }) {
  const token = localStorage.getItem('accessToken');
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('accessToken'));

  const handleLogin = () => setAuthed(true);
  const handleLogout = () => setAuthed(false);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={authed ? <Navigate to="/dashboard" replace /> : <Landing />} />
        <Route path="/login" element={
          authed ? <Navigate to="/dashboard" replace /> : <Login onLogin={handleLogin} />
        } />
        <Route path="/signup" element={
          authed ? <Navigate to="/dashboard" replace /> : <Signup onLogin={handleLogin} />
        } />
        <Route path="/forgot-password" element={
          authed ? <Navigate to="/dashboard" replace /> : <ForgotPassword />
        } />

        {/* Protected dashboard routes */}
        <Route path="/dashboard" element={
          <RequireAuth><PrivateLayout><Dashboard /></PrivateLayout></RequireAuth>
        } />
        <Route path="/vehicles" element={
          <RequireAuth><PrivateLayout><Vehicles /></PrivateLayout></RequireAuth>
        } />
        <Route path="/cameras" element={
          <RequireAuth><PrivateLayout><Cameras /></PrivateLayout></RequireAuth>
        } />
        <Route path="/logs" element={
          <RequireAuth><PrivateLayout><Logs /></PrivateLayout></RequireAuth>
        } />
        <Route path="/change-password" element={
          <RequireAuth><PrivateLayout><ChangePassword /></PrivateLayout></RequireAuth>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
