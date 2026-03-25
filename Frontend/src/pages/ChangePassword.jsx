import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { updatePassword } from '../api';

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setSuccess('');

    if (newPassword !== confirm) return setError('New passwords do not match');
    if (newPassword.length < 6) return setError('New password must be at least 6 characters');
    if (currentPassword === newPassword) return setError('New password must be different from current password');

    setLoading(true);
    try {
      await updatePassword({ currentPassword, newPassword });
      setSuccess('Password updated successfully! Please sign in again with your new password.');
      setCurrentPassword(''); setNewPassword(''); setConfirm('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="main">
      {/* Page header — matches other dashboard pages */}
      <div className="topbar">
        <div>
          <h2>Change Password</h2>
          <p>Update your account credentials</p>
        </div>
        <img src="/dtu-logo.png" alt="DTU" className="topbar-logo" />
      </div>

      {/* Narrow form card, centred in the content area */}
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="card" style={{ padding: '32px 36px' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: 'var(--green)', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', marginBottom: 12,
            }}>
              <KeyRound size={24} color="#fff" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              Update Password
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              Enter your current password to set a new one
            </p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <input
                className="form-input"
                type="password"
                placeholder="Enter current password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                className="form-input"
                type="password"
                placeholder="Min 6 characters"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input
                className="form-input"
                type="password"
                placeholder="Repeat new password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              style={{ marginTop: 4 }}
              disabled={loading}
            >
              {loading ? <span className="spinner" /> : 'Update Password'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-full"
              style={{ marginTop: 8 }}
              onClick={() => navigate(-1)}
            >
              ← Back
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
