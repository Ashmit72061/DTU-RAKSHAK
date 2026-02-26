import { useEffect, useRef, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Upload, Download, FileText, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { getVehicles, createVehicle, updateVehicle, deleteVehicle, bulkImportVehicles } from '../api';

const EMPTY = { name: '', fathersName: '', dept: '', dateOfIssue: '', vehicleType: '2W', stickerNo: '', vehicleNo: '', mobileNo: '', countryCode: '+91' };
const TYPES = ['2W', '4W', 'Heavy', 'Electric'];
const COUNTRY_CODES = [
  { code: '+91', flag: '🇮🇳' },
  { code: '+1', flag: '🇺🇸' },
  { code: '+44', flag: '🇬🇧' },
  { code: '+61', flag: '🇦🇺' },
  { code: '+971', flag: '🇦🇪' },
];

const VEHICLE_CSV_TEMPLATE =
  'name,fathersName,dept,dateOfIssue,vehicleType,stickerNo,vehicleNo,mobileNo\n' +
  'Ravi Kumar,Suresh Kumar,ECE,2024-08-01,2W,STK-001,DL3CAF0001,9876543210\n' +
  'Priya Singh,Mohan Singh,MBA,2024-09-15,4W,STK-002,HR26DK5678,9123456780\n';

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null); // null | 'add' | 'edit' | 'csv'
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState(null);

  // — CSV import state —
  const [csvFile, setCsvFile] = useState(null);
  const [csvDragging, setCsvDragging] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState(null); // { inserted, skipped, errors }
  const fileInputRef = useRef(null);

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
    setForm({ ...v, dateOfIssue: v.dateOfIssue?.split('T')[0] || '', countryCode: v.countryCode || '+91' });
    setError(''); setModal('edit');
  }
  function openCsv() {
    setCsvFile(null); setCsvResult(null); setError('');
    setModal('csv');
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

  // — CSV drag-and-drop handlers —
  function onDragOver(e) { e.preventDefault(); setCsvDragging(true); }
  function onDragLeave() { setCsvDragging(false); }
  function onDrop(e) {
    e.preventDefault(); setCsvDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }
  function pickFile(f) {
    if (!f.name.endsWith('.csv')) { setError('Please select a .csv file'); return; }
    setError(''); setCsvFile(f); setCsvResult(null);
  }

  function downloadTemplate() {
    const blob = new Blob([VEHICLE_CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'vehicles_template.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCsvUpload() {
    if (!csvFile) { setError('Please select a CSV file first'); return; }
    setCsvUploading(true); setError(''); setCsvResult(null);
    try {
      const res = await bulkImportVehicles(csvFile);
      setCsvResult(res.data.data);
      load(); // refresh the table
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally { setCsvUploading(false); }
  }

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="main">
      <div className="topbar">
        <div>
          <h2>Registered Vehicles</h2>
          <p>Manage campus vehicle authorizations — {total} total registered</p>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-secondary" onClick={openCsv}><Upload size={16} /> Import CSV</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus /> Add Vehicle</button>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search-wrap">
            <Search />
            <input className="search-input" placeholder="Search by plate, name, dept…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <span className="records-count">{total} records</span>
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
                    <div className="cell-bold">{v.name}</div>
                    <div className="cell-sub">S/o {v.fathersName}</div>
                  </td>
                  <td><span className="badge blue">{v.dept}</span></td>
                  <td><span className="badge gray">{v.vehicleType}</span></td>
                  <td className="cell-sm">{v.stickerNo}</td>
                  <td className="cell-sm">{v.mobileNo}</td>
                  <td>
                    <div className="actions-row">
                      <button className="btn btn-secondary btn-icon" onClick={() => openEdit(v)}><Pencil size={14} /></button>
                      <button className="btn btn-danger btn-icon" onClick={() => setDeleteId(v.vehicleNo)}><Trash2 size={14} /></button>
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

      {/* ── Add / Edit Modal ──────────────────────────────────────── */}
      {(modal === 'add' || modal === 'edit') && (
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
                    <select className="form-select phone-code-select" value={form.countryCode}
                      onChange={e => setForm(f => ({ ...f, countryCode: e.target.value }))}>
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

      {/* ── CSV Import Modal ──────────────────────────────────────── */}
      {modal === 'csv' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Import Vehicles from CSV</h2>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>

            {!csvResult ? (
              <>
                {/* Template download hint */}
                <div className="csv-hint">
                  <FileText size={14} />
                  <span>Required columns: <code>name, fathersName, dept, dateOfIssue, vehicleType, stickerNo, vehicleNo, mobileNo</code></span>
                  <button className="btn-link" onClick={downloadTemplate}><Download size={13} /> Download template</button>
                </div>

                {error && <div className="alert alert-error">{error}</div>}

                {/* Drop zone */}
                <div
                  className={`csv-drop-zone ${csvDragging ? 'dragging' : ''} ${csvFile ? 'has-file' : ''}`}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }}
                    onChange={e => { if (e.target.files[0]) pickFile(e.target.files[0]); }} />
                  {csvFile ? (
                    <div className="csv-file-chosen">
                      <FileText size={24} />
                      <span className="csv-filename">{csvFile.name}</span>
                      <span className="csv-filesize">({(csvFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  ) : (
                    <div className="csv-placeholder">
                      <Upload size={28} />
                      <p>Drag &amp; drop your CSV here, or <span className="csv-browse">browse</span></p>
                      <p className="csv-hint-small">Only .csv files · Max 5 MB</p>
                    </div>
                  )}
                </div>

                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleCsvUpload} disabled={!csvFile || csvUploading}>
                    {csvUploading ? <><span className="spinner" /> Uploading…</> : <><Upload size={15} /> Upload &amp; Import</>}
                  </button>
                </div>
              </>
            ) : (
              /* Result view */
              <>
                <div className="csv-result-summary">
                  <div className="csv-stat green"><CheckCircle size={18} /><span><strong>{csvResult.inserted}</strong> inserted</span></div>
                  <div className="csv-stat amber"><AlertCircle size={18} /><span><strong>{csvResult.skipped}</strong> skipped</span></div>
                  <div className="csv-stat red"><XCircle size={18} /><span><strong>{csvResult.errors.length}</strong> errors</span></div>
                </div>

                {csvResult.errors.length > 0 && (
                  <div className="csv-errors-wrap">
                    <p className="csv-errors-title">Row-level errors:</p>
                    <div className="table-wrap csv-error-table">
                      <table>
                        <thead><tr><th>Row</th><th>Reason</th></tr></thead>
                        <tbody>
                          {csvResult.errors.map((e, i) => (
                            <tr key={i}><td className="cell-sm">#{e.row}</td><td>{e.reason}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={openCsv}>Import Another File</button>
                  <button className="btn btn-primary" onClick={() => setModal(null)}>Done</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Delete confirm ────────────────────────────────────────── */}
      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Vehicle</h2>
              <button className="modal-close" onClick={() => setDeleteId(null)}>×</button>
            </div>
            <p className="modal-body-text">
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
