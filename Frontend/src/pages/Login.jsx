import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { signIn, verifySigninOtp } from '../api';

export default function Login({ onLogin }) {
  const [step, setStep] = useState('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const otpRefs = useRef([]);

  async function handleSignIn(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await signIn({ email, password });
      setStep('otp');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials');
    } finally { setLoading(false); }
  }

  async function handleOtp(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await verifySigninOtp({ email, otp: otp.join('') });
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
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  }

  function handleOtpKey(i, e) {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/dtu-logo.png" alt="DTU Logo" />
          <h1>DTU Rakshak</h1>
          <p>Campus Vehicle Monitoring System</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {step === 'credentials' ? (
          <form onSubmit={handleSignIn}>
            <p className="auth-subtitle">Sign in to access the campus security dashboard</p>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="form-input" type="email" placeholder="admin@dtu.ac.in"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Continue with OTP →'}
            </button>
            <p className="auth-switch">New here? <Link to="/signup">Create account</Link></p>
          </form>
        ) : (
          <form onSubmit={handleOtp}>
            <p className="auth-subtitle">Enter the 6-digit OTP sent to <strong>{email}</strong></p>
            <div className="otp-grid">
              {otp.map((d, i) => (
                <input key={i} ref={el => otpRefs.current[i] = el}
                  className="otp-input" maxLength={1} value={d}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKey(i, e)} inputMode="numeric" />
              ))}
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Verify & Sign In'}
            </button>
            <button type="button" onClick={() => setStep('credentials')}
              className="btn btn-secondary btn-full" style={{ marginTop: 8 }}>
              ← Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
