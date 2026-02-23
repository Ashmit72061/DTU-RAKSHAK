import { useEffect, useState } from 'react';
import { Plus, MapPin, Pencil, Trash2 } from 'lucide-react';
import { getCameras, createCamera, updateCamera, deleteCamera } from '../api';

const EMPTY = { lat: '', long: '', cameraType: 'ENTRY', cameraLocation: '' };
const TYPES = ['ENTRY', 'EXIT', 'BOTH'];
const TYPE_COLORS = { ENTRY: 'green', EXIT: 'red', BOTH: 'blue' };

export default function Cameras() {
  const [cameras, setCameras] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState(null);

  async function load() { try { const r = await getCameras(); setCameras(r.data.data); } catch { } }
  useEffect(() => { load(); }, []);

  function openAdd() { setForm(EMPTY); setError(''); setModal('add'); }
  function openEdit(c) { setForm({ ...c }); setError(''); setModal('edit'); }

  async function handleSave(e) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      if (modal === 'add') await createCamera(form);
      else await updateCamera(form.id, form);
      setModal(null); load();
    } catch (err) { setError(err.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    try { await deleteCamera(deleteId); setDeleteId(null); load(); } catch { }
  }

  return (
    <div className="main">
      <div className="topbar">
        <div>
          <h2>Campus Cameras</h2>
          <p>Manage CCTV cameras at DTU campus entry/exit points — {cameras.length} installed</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus /> Add Camera</button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Location</th><th>Type</th><th>Coordinates</th><th>Camera ID</th><th>Registered</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {cameras.length === 0 ? (
                <tr><td colSpan={6}><div className="empty"><MapPin /><p>No cameras registered yet</p></div></td></tr>
              ) : cameras.map(c => (
                <tr key={c.id}>
                  <td className="cell-bold">{c.cameraLocation}</td>
                  <td><span className={`badge ${TYPE_COLORS[c.cameraType]}`}>{c.cameraType}</span></td>
                  <td className="cell-mono">{c.lat.toFixed(4)}, {c.long.toFixed(4)}</td>
                  <td className="cell-mono-sm">{c.id.slice(0, 8)}…</td>
                  <td className="cell-sm">{new Date(c.createdAt).toLocaleDateString('en-IN')}</td>
                  <td>
                    <div className="actions-row">
                      <button className="btn btn-secondary btn-icon" onClick={() => openEdit(c)}><Pencil size={14} /></button>
                      <button className="btn btn-danger btn-icon" onClick={() => setDeleteId(c.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modal === 'add' ? 'Register Camera' : 'Edit Camera'}</h2>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">Camera Location</label>
                <input className="form-input" required placeholder="e.g. Main Gate, Gate 2 — North Campus"
                  value={form.cameraLocation} onChange={e => setForm(f => ({ ...f, cameraLocation: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Camera Type</label>
                <select className="form-select" value={form.cameraType} onChange={e => setForm(f => ({ ...f, cameraType: e.target.value }))}>
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Latitude</label>
                  <input className="form-input" type="number" step="any" required placeholder="28.7507"
                    value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Longitude</label>
                  <input className="form-input" type="number" step="any" required placeholder="77.1152"
                    value={form.long} onChange={e => setForm(f => ({ ...f, long: e.target.value }))} />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" /> : (modal === 'add' ? 'Register' : 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Remove Camera</h2>
              <button className="modal-close" onClick={() => setDeleteId(null)}>×</button>
            </div>
            <p className="modal-body-text">Remove this camera from the campus network?</p>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
