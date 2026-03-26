import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { signIn, verifySigninOtp, resendOtp } from '../api';

const RESEND_COOLDOWN = 60; // seconds

export default function Login({ onLogin }) {
  const location = useLocation();
  const [step, setStep] = useState('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Success message passed via router state (e.g. after ForgotPassword reset)
  const [successMsg] = useState(location.state?.message || '');
  const [resendTimer, setResendTimer] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');
  const otpRefs = useRef([]);
  const timerRef = useRef(null);

  // Start countdown when entering OTP step
  useEffect(() => {
    if (step === 'otp') startCooldown();
    return () => clearInterval(timerRef.current);
  }, [step]);

  function startCooldown() {
    setResendTimer(RESEND_COOLDOWN);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) { clearInterval(timerRef.current); return 0; }
        return t - 1;
      });
    }, 1000);
  }

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

  async function handleResend() {
    setResendSuccess(''); setError(''); setResendLoading(true);
    try {
      await resendOtp({ email, type: 'SIGNIN' });
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
      setResendSuccess('A new OTP has been sent to your email.');
      startCooldown();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend OTP. Please try again.');
    } finally { setResendLoading(false); }
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

  // Paste a full 6-digit OTP into any box → distributes across all inputs
  const handleOtpPaste = useCallback((e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim().replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = Array(6).fill('');
    pasted.split('').forEach((ch, idx) => { next[idx] = ch; });
    setOtp(next);
    otpRefs.current[Math.min(pasted.length - 1, 5)]?.focus();
  }, []);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/dtu-logo.png" alt="DTU Logo" />
          <h1>DTU Rakshak</h1>
          <p>Campus Vehicle Monitoring System</p>
        </div>

        {successMsg && <div className="alert alert-success">{successMsg}</div>}
        {error && <div className="alert alert-error">{error}</div>}
        {resendSuccess && <div className="alert alert-success">{resendSuccess}</div>}

        {step === 'credentials' ? (
          <form onSubmit={handleSignIn}>
            <p className="auth-subtitle">Sign in to access the campus security dashboard</p>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="form-input" type="email" placeholder="admin@dtu.ac.in"
                value={email} onChange={e => setEmail(e.target.value.toLowerCase())} required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Continue with OTP →'}
            </button>
            <p className="auth-switch" style={{ marginTop: 10 }}>
              <Link to="/forgot-password">Forgot password?</Link>
            </p>
            <p className="auth-switch">New here? <Link to="/signup">Create account</Link></p>
          </form>
        ) : (
          <form onSubmit={handleOtp}>
            <p className="auth-subtitle">
              Enter the 6-digit OTP sent to <strong>{email}</strong>
            </p>
            <div className="otp-grid">
              {otp.map((d, i) => (
                <input key={i} ref={el => otpRefs.current[i] = el}
                  className="otp-input" maxLength={1} value={d}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKey(i, e)}
                  onPaste={handleOtpPaste}
                  inputMode="numeric"
                  autoComplete="one-time-code" />
              ))}
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Verify & Sign In'}
            </button>
            <div className="resend-row">
              {resendTimer > 0 ? (
                <span className="resend-countdown">Resend OTP in {resendTimer}s</span>
              ) : (
                <button type="button" className="resend-btn" onClick={handleResend}
                  disabled={resendLoading}>
                  {resendLoading ? 'Sending…' : 'Resend OTP'}
                </button>
              )}
            </div>
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
