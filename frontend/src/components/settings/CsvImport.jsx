import { useState, useRef } from 'react';
import { showToast } from '../common/Toast';
import Spinner from '../common/Spinner';

export default function CsvImport({ api }) {
  const [step, setStep] = useState('idle'); // idle | preview | done
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setLoading(true);
    try {
      const r = await api.post('/import/preview', fd);
      setPreview(r.data);
      setMapping(r.data.suggestedMapping || {});
      setStep('preview');
    } catch { showToast('Failed to parse CSV', 'error'); }
    setLoading(false);
  }

  async function handleConfirm() {
    setLoading(true);
    try {
      const r = await api.post('/import/confirm', { rows: preview.rows, mapping });
      showToast(`Imported ${r.data.created} expenses (${r.data.skipped} skipped)`);
      setStep('done');
    } catch { showToast('Import failed', 'error'); }
    setLoading(false);
  }

  const resetFields = ['amount', 'date', 'description', 'category', 'currency'];

  return (
    <div>
      <h3 className="font-medium text-gray-900 dark:text-white mb-3">Import from CSV</h3>
      {step === 'idle' && (
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Upload a CSV file with your expense data. AI will map columns automatically (requires Claude API key).
          </p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          <button onClick={() => fileRef.current.click()} disabled={loading} className="btn-secondary flex items-center gap-2">
            {loading ? <><Spinner size="sm" /> Processing...</> : '📁 Choose CSV file'}
          </button>
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">{preview.totalRows} rows found. Map columns:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {resetFields.map(field => (
              <div key={field}>
                <label className="label capitalize">{field}</label>
                <select className="input text-sm" value={mapping[field] || ''}
                  onChange={e => setMapping(p => ({ ...p, [field]: e.target.value || null }))}>
                  <option value="">— skip —</option>
                  {preview.headers.map(h => <option key={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
            <table className="text-xs w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>{preview.headers.map(h => <th key={h} className="px-2 py-1 text-left text-gray-600 dark:text-gray-300">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {preview.rows.slice(0, 3).map((row, i) => (
                  <tr key={i}>{preview.headers.map(h => <td key={h} className="px-2 py-1 text-gray-700 dark:text-gray-300 truncate max-w-[100px]">{row[h]}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep('idle')} className="btn-secondary">Back</button>
            <button onClick={handleConfirm} disabled={loading || !mapping.amount} className="btn-primary flex items-center gap-2">
              {loading ? <><Spinner size="sm" /> Importing...</> : `Import ${preview.totalRows} rows`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="flex items-center gap-3">
          <span className="text-emerald-500 text-xl">✓</span>
          <span className="text-sm text-gray-700 dark:text-gray-300">Import complete.</span>
          <button onClick={() => setStep('idle')} className="btn-secondary text-sm py-1">Import another</button>
        </div>
      )}
    </div>
  );
}
