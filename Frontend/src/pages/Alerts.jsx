import { useEffect, useState, useRef } from 'react';
import { Search, Bell, BellOff, CheckCircle } from 'lucide-react';
import { getAlerts, resolveAlert, acknowledgeAlert } from '../api';

const TYPE_COLORS = {
  ORPHAN_SIGHTING:            'amber',
  CONCURRENT_ENTRY_OVERWRITE: 'amber',
  EXIT_WITHOUT_ENTRY:         'red',
  OVERSTAY:                   'red',
  ACTIVE_OVERSTAY_ALARM:      'red',
};

const STATUS_COLORS = {
  OPEN:         'red',
  ACKNOWLEDGED: 'amber',
  RESOLVED:     'green',
};

function fmtType(t) {
  return t?.replace(/_/g, ' ') ?? '—';
}

export default function Alerts() {
  const [alerts, setAlerts]     = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [filter, setFilter]     = useState('all');   // 'all' | 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'
  const [search, setSearch]     = useState('');
  const [liveCount, setLiveCount] = useState(0);
  const eventSourceRef          = useRef(null);
  const LIMIT = 20;

  async function load() {
    try {
      const params = { page, limit: LIMIT };
      if (filter !== 'all') params.status = filter;
      const r = await getAlerts(params);
      setAlerts(r.data.data.alerts ?? []);
      setTotal(r.data.data.total ?? 0);
    } catch { }
  }

  // SSE — updates the table when a new alert fires (toast is handled globally in AlertToast)
  useEffect(() => {
    const es = new EventSource('/api/v1/alerts/stream');
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'CONNECTED') return;
      setLiveCount(c => c + 1);
      load();
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  useEffect(() => { setLiveCount(0); load(); }, [page, filter]);

  const filtered = search
    ? alerts.filter(a =>
        a.rawPlate?.toLowerCase().includes(search.toLowerCase()) ||
        a.alertType?.toLowerCase().includes(search.toLowerCase())
      )
    : alerts;

  const pages = Math.ceil(total / LIMIT);

  async function handleAck(id) {
    try { await acknowledgeAlert(id); load(); } catch { }
  }

  async function handleResolve(id) {
    try { await resolveAlert(id); load(); } catch { }
  }

  return (
    <div className="main">
      <div className="topbar">
        <div>
          <h2>
            Alerts &amp; Anomalies
            {liveCount > 0 && (
              <span className="badge red" style={{ marginLeft: 10, fontSize: 12 }}>
                {liveCount} Live
              </span>
            )}
          </h2>
          <p>Security anomalies and system alerts detected by the scan pipeline</p>
        </div>
        <div className="topbar-right">
          <span className="badge red">
            {alerts.filter(a => a.status === 'OPEN').length} Open
          </span>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="tabs">
        {[
          { key: 'all',          label: `All (${total})` },
          { key: 'OPEN',         label: 'Open' },
          { key: 'ACKNOWLEDGED', label: 'Acknowledged' },
          { key: 'RESOLVED',     label: 'Resolved' },
        ].map(t => (
          <button key={t.key} className={`tab ${filter === t.key ? 'active' : ''}`}
            onClick={() => { setFilter(t.key); setPage(1); }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search-wrap">
            <Search />
            <input className="search-input" placeholder="Search plate or alert type…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Alert Type</th>
                <th>Raw Plate</th>
                <th>Camera</th>
                <th>Description</th>
                <th>Status</th>
                <th>Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7}><div className="empty"><p>No alerts found</p></div></td></tr>
              ) : filtered.map(a => (
                <tr key={a.id}>
                  <td>
                    <span className={`badge ${TYPE_COLORS[a.alertType] ?? 'gray'}`} style={{ fontSize: 11 }}>
                      {fmtType(a.alertType)}
                    </span>
                  </td>
                  <td><span className="plate">{a.rawPlate ?? '—'}</span></td>
                  <td className="cell-sm">{a.camera?.cameraLocation ?? '—'}</td>
                  <td className="cell-sm" style={{ maxWidth: 260, whiteSpace: 'normal' }}>{a.description}</td>
                  <td>
                    <span className={`badge ${STATUS_COLORS[a.status] ?? 'gray'}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="cell-sm">{new Date(a.createdAt).toLocaleString('en-IN')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {a.status === 'OPEN' && (
                        <button className="btn btn-secondary btn-icon" title="Acknowledge"
                          onClick={() => handleAck(a.id)}>
                          <Bell size={14} />
                        </button>
                      )}
                      {a.status !== 'RESOLVED' && (
                        <button className="btn btn-primary btn-icon" title="Mark Resolved"
                          onClick={() => handleResolve(a.id)}>
                          <CheckCircle size={14} />
                        </button>
                      )}
                      {a.status === 'RESOLVED' && (
                        <span className="cell-muted" style={{ fontSize: 12, paddingTop: 4 }}>
                          <BellOff size={12} style={{ verticalAlign: 'middle' }} /> Done
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="pagination">
            {Array.from({ length: pages }, (_, i) => (
              <button key={i} className={`btn ${page === i + 1 ? 'btn-primary' : 'btn-secondary'} btn-icon`}
                onClick={() => setPage(i + 1)}>{i + 1}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
