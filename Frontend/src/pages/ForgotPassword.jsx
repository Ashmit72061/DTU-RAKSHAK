import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { forgotPassword, verifyForgotPasswordOtp, resendOtp } from '../api';

const RESEND_COOLDOWN = 60; // seconds

export default function ForgotPassword() {
  const [step, setStep] = useState('email'); // 'email' | 'otp'
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');
  const otpRefs = useRef([]);
  const timerRef = useRef(null);
  const navigate = useNavigate();

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

  async function handleRequestOtp(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await forgotPassword({ email });
      setStep('otp');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP. Please try again.');
    } finally { setLoading(false); }
  }

  async function handleVerifyAndReset(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) return setError('Passwords do not match');
    if (newPassword.length < 6) return setError('Password must be at least 6 characters');

    setLoading(true);
    try {
      await verifyForgotPasswordOtp({ email, otp: otp.join(''), newPassword });
      // Navigate to login after successful reset
      navigate('/login', { state: { message: 'Password reset successfully. Please sign in.' } });
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP');
    } finally { setLoading(false); }
  }

  async function handleResend() {
    setResendSuccess(''); setError(''); setResendLoading(true);
    try {
      await resendOtp({ email, type: 'FORGOT_PASSWORD' });
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
          <h1>Reset Password</h1>
          <p>DTU Rakshak — Campus Vehicle Monitoring</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {resendSuccess && <div className="alert alert-success">{resendSuccess}</div>}

        {step === 'email' ? (
          <form onSubmit={handleRequestOtp}>
            <p className="auth-subtitle">
              Enter your registered email to receive a password reset OTP.
            </p>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="form-input" type="email" placeholder="admin@dtu.ac.in"
                value={email} onChange={e => setEmail(e.target.value.toLowerCase())} required />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Send Reset OTP →'}
            </button>
            <p className="auth-switch">
              <Link to="/login">← Back to Sign In</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerifyAndReset}>
            <p className="auth-subtitle">
              Enter the OTP sent to <strong>{email}</strong> and your new password.
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
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input className="form-input" type="password" placeholder="Min 6 characters"
                value={newPassword} onChange={e => setNewPassword(e.target.value)}
                required minLength={6} autoComplete="new-password" />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input className="form-input" type="password" placeholder="Repeat new password"
                value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                required autoComplete="new-password" />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Reset Password'}
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
            <button type="button" onClick={() => setStep('email')}
              className="btn btn-secondary btn-full" style={{ marginTop: 8 }}>
              ← Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
