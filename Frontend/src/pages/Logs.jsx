import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getLogs, getActiveLogs } from '../api';

function fmt(seconds) {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function Logs() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('all'); // 'all' | 'active' | 'unauthorized'
  const [logs, setLogs] = useState([]);
  const [activeLogs, setActiveLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'true' | 'false'
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;

  async function loadAll() {
    try {
      const params = { page, limit: LIMIT };
      if (filter !== 'all') params.authorized = filter;
      const r = await getLogs(params);
      setLogs(r.data.data.logs);
      setTotal(r.data.data.total);
    } catch { }
  }

  async function loadActive() {
    try { const r = await getActiveLogs(); setActiveLogs(r.data.data.logs); } catch { }
  }

  useEffect(() => { loadAll(); loadActive(); }, [page, filter]);

  const displayed = tab === 'active' ? activeLogs
    : tab === 'unauthorized' ? logs.filter(l => !l.isAuthorized)
      : logs;

  const filtered = search
    ? displayed.filter(l => l.vehicleNo.includes(search.toUpperCase()) || l.camera?.cameraLocation?.toLowerCase().includes(search.toLowerCase()))
    : displayed;

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="main">
      <div className="topbar">
        <div>
          <h2>Entry / Exit Logs</h2>
          <p>All vehicle movement records on DTU campus</p>
        </div>
        <div className="topbar-right">
          <span className="badge green">{activeLogs.length} Inside Campus</span>
        </div>
      </div>

      <div className="tabs">
        {[
          { key: 'all', label: `All Logs (${total})` },
          { key: 'active', label: `On Campus (${activeLogs.length})` },
          { key: 'unauthorized', label: 'Unauthorized' },
        ].map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search-wrap">
            <Search />
            <input className="search-input" placeholder="Search plate number or location…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {tab === 'all' && (
            <select className="form-select filter-select" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}>
              <option value="all">All Vehicles</option>
              <option value="true">Authorized Only</option>
              <option value="false">Unauthorized Only</option>
            </select>
          )}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vehicle No.</th>
                <th>Camera / Gate</th>
                <th>Entry Time</th>
                <th>Exit Time</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Event</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7}><div className="empty"><p>No logs found</p></div></td></tr>
              ) : filtered.map(l => (
                <tr 
                  key={l.id} 
                  onClick={() => navigate(`/live-map?entryId=${l.id}`)} 
                  className="clickable-row"
                  title="Click to view path on map"
                >
                  <td><span className="plate">{l.vehicleNo}</span></td>
                  <td>
                    <div className="cell-bold">{l.camera?.cameraLocation || '—'}</div>
                    <div className="cell-sub">{l.camera?.cameraType}</div>
                  </td>
                  <td className="cell-sm">{new Date(l.entryTime).toLocaleString('en-IN')}</td>
                  <td className={`cell-sm ${!l.exitTime ? 'cell-muted' : ''}`}>
                    {l.exitTime ? new Date(l.exitTime).toLocaleString('en-IN') : 'Still Inside'}
                  </td>
                  <td className="cell-sm">{fmt(l.vehicleDuration)}</td>
                  <td>
                    <span className={`badge ${l.isAuthorized ? 'green' : 'red'}`}>
                      {l.isAuthorized ? '✓ Auth' : '✗ Unauth'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${l.exitTime ? 'gray' : 'amber'}`}>
                      {l.exitTime ? 'Exited' : 'Entry'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {tab === 'all' && pages > 1 && (
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
