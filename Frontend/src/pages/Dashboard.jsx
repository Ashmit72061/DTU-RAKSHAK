import { useEffect, useState } from 'react';
import { Car, Camera, ClipboardList, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getLogs, getActiveLogs, getVehicles, getCameras } from '../api';

const COLORS = ['#27AE60', '#e74c3c', '#f39c12', '#2980b9'];

function fmt(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function Dashboard() {
  const [stats, setStats] = useState({ vehicles: 0, cameras: 0, active: 0, unauthorized: 0 });
  const [recentLogs, setRecentLogs] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [pieData, setPieData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [logsRes, activeRes, vehiclesRes, camerasRes] = await Promise.all([
          getLogs({ limit: 50 }), getActiveLogs(), getVehicles({ limit: 1 }), getCameras()
        ]);
        const logs = logsRes.data.data.logs;
        const active = activeRes.data.data.count;
        const unauthorized = logs.filter(l => !l.isAuthorized).length;

        setStats({
          vehicles: vehiclesRes.data.data.total,
          cameras: camerasRes.data.data.length,
          active,
          unauthorized,
        });
        setRecentLogs(logs.slice(0, 8));

        // Build chart data by day
        const byDay = {};
        logs.forEach(l => {
          const d = new Date(l.entryTime).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
          byDay[d] = (byDay[d] || 0) + 1;
        });
        setChartData(Object.entries(byDay).slice(-7).map(([date, count]) => ({ date, count })));

        // Pie
        setPieData([
          { name: 'Authorized', value: logs.filter(l => l.isAuthorized).length },
          { name: 'Unauthorized', value: unauthorized },
        ]);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const statCards = [
    { label: 'Registered Vehicles', value: stats.vehicles, icon: Car, cls: 'green' },
    { label: 'Active Cameras', value: stats.cameras, icon: Camera, cls: 'blue' },
    { label: 'Vehicles on Campus', value: stats.active, icon: ClipboardList, cls: 'amber' },
    { label: 'Unauthorized Today', value: stats.unauthorized, icon: AlertTriangle, cls: 'red' },
  ];

  return (
    <div className="main">
      <div className="topbar">
        <div>
          <h2>Campus Dashboard</h2>
          <p>Real-time vehicle monitoring — Delhi Technological University</p>
        </div>
        <img src="/dtu-logo.png" alt="DTU" className="topbar-logo" />
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {statCards.map(({ label, value, icon: Icon, cls }) => (
          <div key={label} className="card stat-card">
            <div className={`stat-icon ${cls}`}><Icon /></div>
            <div className="stat-info">
              <h3>{loading ? '—' : value}</h3>
              <p>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="card">
          <div className="chart-card-title">Vehicle Entries — Last 7 Days</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#27AE60" strokeWidth={2.5}
                dot={{ fill: '#27AE60', r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="chart-card-title">Authorization Status</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false} fontSize={11}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Logs */}
      <div className="card">
        <div className="card-header-row">
          <h3>Recent Scan Activity</h3>
          <a href="/logs">View all →</a>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vehicle No.</th><th>Camera</th><th>Entry Time</th>
                <th>Duration</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.length === 0 && !loading ? (
                <tr><td colSpan={5}><div className="empty"><p>No scan logs yet</p></div></td></tr>
              ) : recentLogs.map(l => (
                <tr key={l.id}>
                  <td><span className="plate">{l.vehicleNo}</span></td>
                  <td className="cell-sub">{l.camera?.cameraLocation || '—'}</td>
                  <td className="cell-sm">{new Date(l.entryTime).toLocaleString('en-IN')}</td>
                  <td className="cell-sm">{fmt(l.vehicleDuration)}</td>
                  <td>
                    <span className={`badge ${l.isAuthorized ? 'green' : 'red'}`}>
                      {l.isAuthorized ? '✓ Authorized' : '✗ Unauthorized'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
