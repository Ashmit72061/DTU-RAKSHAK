import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { signUp, verifySignupOtp } from '../api';

export default function Signup({ onLogin }) {
  const [step, setStep] = useState('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const refs = useRef([]);

  async function handleSignup(e) {
    e.preventDefault();
    if (password !== confirm) return setError('Passwords do not match');
    setError(''); setLoading(true);
    try {
      await signUp({ email, password });
      setStep('otp');
    } catch (err) {
      setError(err.response?.data?.message || 'Signup failed');
    } finally { setLoading(false); }
  }

  async function handleOtp(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await verifySignupOtp({ email, otp: otp.join('') });
      const { accessToken } = res.data.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('email', email);
      onLogin();
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid OTP');
    } finally { setLoading(false); }
  }

  function handleOtpChange(i, val) {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp]; next[i] = val;
    setOtp(next);
    if (val && i < 5) refs.current[i + 1]?.focus();
  }

  function handleOtpKey(i, e) {
    if (e.key === 'Backspace' && !otp[i] && i > 0) refs.current[i - 1]?.focus();
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/dtu-logo.png" alt="DTU" />
          <h1>DTU Rakshak</h1>
          <p>Campus Vehicle Monitoring System</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {step === 'form' ? (
          <form onSubmit={handleSignup}>
            <p className="auth-subtitle">Create your admin account</p>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="form-input" type="email" placeholder="admin@dtu.ac.in"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="Min 8 characters"
                value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input className="form-input" type="password" placeholder="Repeat password"
                value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Create Account'}
            </button>
            <p className="auth-switch">Already have an account? <Link to="/login">Sign In</Link></p>
          </form>
        ) : (
          <form onSubmit={handleOtp}>
            <p className="auth-subtitle">Enter the 6-digit OTP sent to <strong>{email}</strong></p>
            <div className="otp-grid">
              {otp.map((d, i) => (
                <input key={i} ref={el => refs.current[i] = el}
                  className="otp-input" maxLength={1} value={d}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKey(i, e)} inputMode="numeric" />
              ))}
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Verify & Create Account'}
            </button>
            <button type="button" onClick={() => setStep('form')}
              className="btn btn-secondary btn-full" style={{ marginTop: 8 }}>← Back</button>
          </form>
        )}
      </div>
    </div>
  );
}
