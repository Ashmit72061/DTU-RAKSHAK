import { useEffect, useState } from 'react';

const DURATION = 6000; // ms each toast stays

const TYPE_ICONS = {
  ACTIVE_OVERSTAY_ALARM:      '🚨',
  OVERSTAY:                   '⏱️',
  EXIT_WITHOUT_ENTRY:         '🚪',
  CONCURRENT_ENTRY_OVERWRITE: '⚠️',
  ORPHAN_SIGHTING:            '👁️',
};

export default function AlertToast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return; // don't open SSE when logged out

    const url = '/api/v1/alerts/stream';
    const es = new EventSource(url);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'CONNECTED') return;

      const id = Date.now();
      setToasts(prev => [...prev, { id, ...data }]);

      // auto-dismiss after DURATION
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, DURATION);
    };

    es.onerror = () => { /* browser auto-reconnects SSE — do not call es.close() here */ };


    return () => es.close();
  }, []);

  function dismiss(id) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24,
      display: 'flex', flexDirection: 'column', gap: 10,
      zIndex: 9999, maxWidth: 360,
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: '#1e1e2e', border: '1px solid #f38ba8',
          borderLeft: '4px solid #f38ba8', borderRadius: 10,
          padding: '14px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          animation: 'slideIn 0.3s ease',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, color: '#f38ba8', fontSize: 13 }}>
              {TYPE_ICONS[t.alertType] ?? '🔔'}&nbsp;
              {t.alertType?.replace(/_/g, ' ')}
            </span>
            <button
              onClick={() => dismiss(t.id)}
              style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
            >×</button>
          </div>
          {t.rawPlate && (
            <span style={{ fontFamily: 'monospace', background: '#313244', color: '#cdd6f4', padding: '2px 8px', borderRadius: 4, fontSize: 13, width: 'fit-content' }}>
              {t.rawPlate}
            </span>
          )}
          <p style={{ color: '#a6adc8', fontSize: 12, margin: 0 }}>{t.description}</p>
        </div>
      ))}

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(40px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
