import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';

const features = [
  { icon: '🎯', title: 'Real-Time Detection', desc: 'AI-powered YOLO model detects and reads number plates from CCTV feeds with high accuracy.' },
  { icon: '🔐', title: 'Authorized Access', desc: 'Instantly cross-references detected vehicles against the campus vehicle registry.' },
  { icon: '⏱️', title: 'Duration Tracking', desc: 'Automatically records entry and exit times, computes how long each vehicle stayed.' },
  { icon: '🚨', title: 'Instant Alerts', desc: 'Flags unauthorized or overstaying vehicles with real-time notifications to security staff.' },
  { icon: '📊', title: 'Analytics Dashboard', desc: 'Visual reports on daily traffic, peak hours, and vehicle movement trends.' },
  { icon: '📷', title: 'Multi-Camera Support', desc: 'Manage multiple entry/exit cameras across all DTU campus gates from one panel.' },
];

const team = [
  { name: 'Ekansh Bhushan', role: 'Backend & DevOps', emoji: '👨‍💻' },
  { name: 'Harsh', role: 'Frontend & UI/UX', emoji: '🎨' },
  { name: 'Kapil Bhait', role: 'ML Model & Training', emoji: '🤖' },
  { name: 'Reena Gupta', role: 'System Architecture', emoji: '⚙️' },
  { name: 'Soliya Showkat', role: 'System Architecture', emoji: '⚙️' },
  { name: 'Ashmit Bindal', role: 'Frontend & Backend', emoji: '⚙️' },
  { name: 'Sonal Verma', role: 'Frontend & Backend', emoji: '⚙️' },
  { name: 'Suvan Kumar', role: 'System Architecture', emoji: '⚙️' },
  { name: 'Aahant Kumar', role: 'ML Model & Training', emoji: '⚙️' },
  { name: 'Nakul', role: 'Hardware Integration', emoji: '⚙️' },
  { name: 'Sarvesh', role: 'Hardware Integration', emoji: '⚙️' },
  { name: 'Rajni', role: 'Automation', emoji: '⚙️' },
];

// Floating particles data
const PARTICLES = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 3 + 1,
  duration: Math.random() * 10 + 8,
  delay: Math.random() * 5,
  opacity: Math.random() * 0.4 + 0.1,
}));

function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

export default function Landing() {
  useScrollReveal();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="landing">

      {/* ── NAVBAR ── */}
      <header className="landing-nav">
        <div className="landing-nav-brand">
          <img src="/dtu-logo.png" alt="DTU" className="nav-logo-spin" />
          <span>DTU Rakshak</span>
        </div>
        <div className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#how">How It Works</a>
          <a href="#team">Team</a>
        </div>
        <div className="landing-nav-actions">
          <Link to="/login" className="btn btn-secondary nav-btn">Sign In</Link>
          <Link to="/signup" className="btn btn-primary  nav-btn">Register</Link>
        </div>
        <button
          className="landing-mobile-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>

        {/* Mobile dropdown menu */}
        <div className={`landing-mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
          <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
          <a href="#how" onClick={() => setMobileMenuOpen(false)}>How It Works</a>
          <a href="#team" onClick={() => setMobileMenuOpen(false)}>Team</a>
          <Link to="/login" onClick={() => setMobileMenuOpen(false)}>Sign In</Link>
          <Link to="/signup" onClick={() => setMobileMenuOpen(false)}>Register →</Link>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="landing-hero">
        {/* Floating particles */}
        <div className="particles" aria-hidden="true">
          {PARTICLES.map(p => (
            <div key={p.id} className="particle" style={{
              left: `${p.x}%`, top: `${p.y}%`,
              width: p.size, height: p.size,
              opacity: p.opacity,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }} />
          ))}
        </div>

        {/* Grid overlay */}
        <div className="hero-grid" aria-hidden="true" />

        <div className="landing-hero-content hero-animate-left">
          <div className="landing-hero-badge animate-badge">Delhi Technological University</div>
          <h1 className="landing-hero-title">
            Smart Vehicle<br />
            <span className="landing-hero-accent gradient-text">Campus Monitoring</span>
          </h1>
          <p className="landing-hero-desc">
            AI-powered real-time vehicle entry tracking for Delhi Technological University.
            Automated number plate detection, authorization checks, and duration monitoring — all in one system.
          </p>
          <div className="landing-hero-btns">
            <Link to="/login" className="btn btn-primary  hero-cta">Access Dashboard →</Link>
            <Link to="/signup" className="btn btn-outline  hero-cta-outline">Create Account</Link>
          </div>
          <div className="landing-hero-stats">
            <div className="stat-pill"><strong>AI-Powered</strong><span>YOLO + OCR</span></div>
            <div className="stat-pill"><strong>Real-Time</strong><span>Live Monitoring</span></div>
            <div className="stat-pill"><strong>Multi-Gate</strong><span>Campus Coverage</span></div>
          </div>
        </div>

        <div className="landing-hero-visual hero-animate-right">
          <div className="hero-rings">
            <div className="ring ring-1" />
            <div className="ring ring-2" />
            <div className="ring ring-3" />
          </div>
          <div className="hero-logo-wrap">
            <img src="/dtu-logo.png" alt="DTU" className="hero-logo-big" />
          </div>
          <div className="hero-orbit">
            {['🎯', '📷', '🚨', '📊'].map((ic, i) => (
              <div key={i} className="orbit-dot" style={{ '--i': i }}>
                <span>{ic}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="landing-section">
        <div className="landing-section-header reveal">
          <h2>System Features</h2>
          <p>Everything needed to manage campus vehicle movement efficiently</p>
        </div>
        <div className="features-grid">
          {features.map((f, i) => (
            <div key={f.title} className="feature-card reveal" style={{ '--delay': `${i * 80}ms` }}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
              <div className="feature-card-line" />
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="landing-section landing-section-dark">
        <div className="landing-section-header light reveal">
          <h2>How It Works</h2>
          <p>Seamless pipeline from camera to dashboard</p>
        </div>
        <div className="steps-row">
          {[
            { n: '01', title: 'Camera Captures', desc: 'Campus gate cameras capture vehicle images in real time.' },
            { n: '02', title: 'AI Detection', desc: 'YOLO model detects the number plate and GLM-OCR reads the text.' },
            { n: '03', title: 'Authorization Check', desc: 'System checks if the vehicle is registered in the campus database.' },
            { n: '04', title: 'Log & Alert', desc: 'Entry/exit is logged. Unauthorized vehicles trigger instant alerts.' },
          ].map((s, i) => (
            <div key={i} className="step-card reveal" style={{ '--delay': `${i * 100}ms` }}>
              <div className="step-connector" />
              <div className="step-num">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── TEAM ── */}
      <section id="team" className="landing-section">
        <div className="landing-section-header reveal">
          <h2>Developer Team</h2>
          <p>Built by Delhi Technological University</p>
        </div>
        <div className="team-grid">
          {team.map((m, i) => (
            <div key={m.name} className="team-card reveal" style={{ '--delay': `${i * 100}ms` }}>
              <div className="team-avatar">{m.emoji}</div>
              <h3>{m.name}</h3>
              <p>{m.role}</p>
              <div className="team-badge">Project Rakshak DTU</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="landing-footer">
        <img src="/dtu-logo.png" alt="DTU" />
        <p><strong>DTU Rakshak</strong> — Campus Vehicle Monitoring System</p>
        <p className="footer-sub">Delhi Technological University · 2026</p>
      </footer>

    </div>
  );
}
