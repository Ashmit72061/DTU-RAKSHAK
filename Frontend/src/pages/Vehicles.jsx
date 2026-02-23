import { useEffect, useState } from 'react';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { getVehicles, createVehicle, updateVehicle, deleteVehicle } from '../api';

const EMPTY = { name: '', fathersName: '', dept: '', dateOfIssue: '', vehicleType: '2W', stickerNo: '', vehicleNo: '', mobileNo: '' };
const TYPES = ['2W', '4W', 'Heavy', 'Electric'];

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null); // null | 'add' | 'edit'
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState(null);

  const LIMIT = 15;

  async function load() {
    try {
      const res = await getVehicles({ search, page, limit: LIMIT });
      setVehicles(res.data.data.vehicles);
      setTotal(res.data.data.total);
    } catch { }
  }

  useEffect(() => { load(); }, [search, page]);

  function openAdd() { setForm(EMPTY); setError(''); setModal('add'); }
  function openEdit(v) {
    setForm({ ...v, dateOfIssue: v.dateOfIssue?.split('T')[0] || '' });
    setError(''); setModal('edit');
  }

  async function handleSave(e) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      if (modal === 'add') await createVehicle(form);
      else await updateVehicle(form.vehicleNo, form);
      setModal(null); load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    try { await deleteVehicle(deleteId); setDeleteId(null); load(); } catch { }
  }

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="main">
      <div className="topbar">
        <div>
          <h2>Registered Vehicles</h2>
          <p>Manage campus vehicle authorizations — {total} total registered</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus /> Add Vehicle</button>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search-wrap">
            <Search />
            <input className="search-input" placeholder="Search by plate, name, dept…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>{total} records</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vehicle No.</th><th>Owner</th><th>Dept</th>
                <th>Type</th><th>Sticker</th><th>Mobile</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 ? (
                <tr><td colSpan={7} className="empty"><p>No vehicles registered yet</p></td></tr>
              ) : vehicles.map(v => (
                <tr key={v.id}>
                  <td><span className="plate">{v.vehicleNo}</span></td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{v.name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>S/o {v.fathersName}</div>
                  </td>
                  <td><span className="badge blue">{v.dept}</span></td>
                  <td><span className="badge gray">{v.vehicleType}</span></td>
                  <td style={{ fontSize: 13 }}>{v.stickerNo}</td>
                  <td style={{ fontSize: 13 }}>{v.mobileNo}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => openEdit(v)}><Pencil size={14} /></button>
                      <button className="btn btn-danger" style={{ padding: '6px 10px' }} onClick={() => setDeleteId(v.vehicleNo)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            {Array.from({ length: pages }, (_, i) => (
              <button key={i} className={`btn ${page === i + 1 ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 12px' }} onClick={() => setPage(i + 1)}>{i + 1}</button>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modal === 'add' ? 'Register Vehicle' : 'Edit Vehicle'}</h2>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSave}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Owner Name</label>
                  <input className="form-input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Father's Name</label>
                  <input className="form-input" required value={form.fathersName} onChange={e => setForm(f => ({ ...f, fathersName: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Vehicle No.</label>
                  <input className="form-input" required placeholder="DL3CAF0001" value={form.vehicleNo}
                    disabled={modal === 'edit'}
                    onChange={e => setForm(f => ({ ...f, vehicleNo: e.target.value.toUpperCase() }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Sticker No.</label>
                  <input className="form-input" required value={form.stickerNo} onChange={e => setForm(f => ({ ...f, stickerNo: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Department</label>
                  <input className="form-input" required placeholder="e.g. ECE, CSE" value={form.dept} onChange={e => setForm(f => ({ ...f, dept: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Vehicle Type</label>
                  <select className="form-select" value={form.vehicleType} onChange={e => setForm(f => ({ ...f, vehicleType: e.target.value }))}>
                    {TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Mobile No.</label>
                  <div className="phone-group">
                    <select
                      className="form-select phone-code-select"
                      value={form.countryCode}
                      onChange={e => setForm(f => ({ ...f, countryCode: e.target.value }))}
                    >
                      {COUNTRY_CODES.map(c => (
                        <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                      ))}
                    </select>
                    <input className="form-input phone-input" required
                      placeholder="9876543269" inputMode="numeric"
                      pattern="\d{10}" maxLength={10} minLength={10}
                      title="Enter a valid 10-digit mobile number"
                      value={form.mobileNo}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setForm(f => ({ ...f, mobileNo: val }));
                      }} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Date of Issue</label>
                  <input className="form-input" type="date" required value={form.dateOfIssue} onChange={e => setForm(f => ({ ...f, dateOfIssue: e.target.value }))} />
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

      {/* Delete confirm */}
      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h2>Delete Vehicle</h2>
              <button className="modal-close" onClick={() => setDeleteId(null)}>×</button>
            </div>
            <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
              Remove <strong>{deleteId}</strong> from the campus registry? This cannot be undone.
            </p>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
