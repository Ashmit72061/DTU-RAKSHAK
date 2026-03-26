import { useEffect, useRef, useState } from 'react';
import { Plus, MapPin, Pencil, Trash2, Upload, Download, FileText, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { getCameras, createCamera, updateCamera, deleteCamera, bulkImportCameras } from '../api';

const EMPTY = { lat: '', long: '', cameraType: 'ENTRY', cameraLocation: '' };
const TYPES = ['ENTRY', 'EXIT', 'INTERIOR'];
const TYPE_COLORS = { ENTRY: 'green', EXIT: 'red', INTERIOR: 'blue' };

const CAMERA_CSV_TEMPLATE =
  'lat,long,cameraType,cameraLocation\n' +
  '28.7507,77.1152,ENTRY,Main Gate\n' +
  '28.7512,77.1160,EXIT,Gate 2 — North Campus\n';

export default function Cameras() {
  const [cameras, setCameras] = useState([]);
  const [modal, setModal] = useState(null); // null | 'add' | 'edit' | 'csv'
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState(null);

  // — CSV import state —
  const [csvFile, setCsvFile] = useState(null);
  const [csvDragging, setCsvDragging] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState(null);
  const fileInputRef = useRef(null);

  async function load() { try { const r = await getCameras(); setCameras(r.data.data); } catch { } }
  useEffect(() => { load(); }, []);

  function openAdd() { setForm(EMPTY); setError(''); setModal('add'); }
  function openEdit(c) { setForm({ ...c }); setError(''); setModal('edit'); }
  function openCsv() { setCsvFile(null); setCsvResult(null); setError(''); setModal('csv'); }

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

  // — CSV drag-and-drop —
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
    const blob = new Blob([CAMERA_CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'cameras_template.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCsvUpload() {
    if (!csvFile) { setError('Please select a CSV file first'); return; }
    setCsvUploading(true); setError(''); setCsvResult(null);
    try {
      const res = await bulkImportCameras(csvFile);
      setCsvResult(res.data.data);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally { setCsvUploading(false); }
  }

  return (
    <div className="main">
      <div className="topbar">
        <div>
          <h2>Campus Cameras</h2>
          <p>Manage CCTV cameras at DTU campus entry/exit points — {cameras.length} installed</p>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-secondary" onClick={openCsv}><Upload size={16} /> Import CSV</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus /> Add Camera</button>
        </div>
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
                  <td><span className={`badge ${TYPE_COLORS[c.cameraType] || 'gray'}`}>{c.cameraType}</span></td>
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

      {/* ── Add / Edit Modal ──────────────────────────────────────── */}
      {(modal === 'add' || modal === 'edit') && (
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

      {/* ── CSV Import Modal ──────────────────────────────────────── */}
      {modal === 'csv' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Import Cameras from CSV</h2>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>

            {!csvResult ? (
              <>
                <div className="csv-hint">
                  <FileText size={14} />
                  <span>Required columns: <code>lat, long, cameraType, cameraLocation</code></span>
                  <button className="btn-link" onClick={downloadTemplate}><Download size={13} /> Download template</button>
                </div>

                {error && <div className="alert alert-error">{error}</div>}

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
