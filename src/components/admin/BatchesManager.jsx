import React from 'react';
import { useApp } from '../../context/AppContext';
import { uid, priceLabel, defaultBatchFeatures } from '../../lib/utils';

export default function BatchesManager() {
  const { DB, saveDB } = useApp();

  const addBatch = () => {
    const name = prompt('Batch name (e.g. "SSC GD Special"):'); if (!name) return;
    const examCategory = prompt('Exam category tag (e.g. "WBP Constable", "Railway (RRB)", "SSC GD"):', 'All Exams') || 'All Exams';
    const featuresInput = prompt("What's Included — list each item separated by a comma (shown on the student Batches page):", defaultBatchFeatures().join(', '));
    const features = (featuresInput === null ? defaultBatchFeatures().join(', ') : featuresInput).split(',').map((f) => f.trim()).filter(Boolean);
    const batch = { id: uid('bt'), name, price: 300, active: true, examCategory, features: features.length ? features : defaultBatchFeatures(), timetable: [['Mon-Fri', 'Regular Classes']] };
    saveDB((prev) => ({ ...prev, batches: [...prev.batches, batch] }));
  };

  const editBatch = (id) => {
    const b = DB.batches.find((x) => x.id === id); if (!b) return;
    const name = prompt('Batch name:', b.name); if (name === null) return;
    const examCategory = prompt('Exam category tag:', b.examCategory || 'All Exams'); if (examCategory === null) return;
    const featuresInput = prompt("What's Included — list each item separated by a comma (shown on the student Batches page):", (b.features && b.features.length ? b.features : defaultBatchFeatures()).join(', ')); if (featuresInput === null) return;
    const features = featuresInput.split(',').map((f) => f.trim()).filter(Boolean);
    saveDB((prev) => ({ ...prev, batches: prev.batches.map((x) => (x.id === id ? { ...x, name, examCategory: examCategory.trim() || x.examCategory, features: features.length ? features : defaultBatchFeatures() } : x)) }));
  };

  const toggleActive = (id) => saveDB((prev) => ({ ...prev, batches: prev.batches.map((b) => (b.id === id ? { ...b, active: !b.active } : b)) }));
  const deleteBatch = (id) => {
    if (!confirm('Delete this batch permanently?')) return;
    saveDB((prev) => ({ ...prev, batches: prev.batches.filter((b) => b.id !== id) }));
  };

  return (
    <div>
      <div className="space-y-3 mb-4">
        {DB.batches.map((b) => (
          <div key={b.id} className="card2 rounded-xl p-4">
            <div className="flex justify-between items-start mb-2">
              <div><p className="font-semibold text-sm">{b.name}</p><p className="text-xs gold-text font-bold">{priceLabel(b.price)}</p><p className="text-[10px] muted mt-0.5">{b.examCategory || 'All Exams'}</p></div>
              <span className={`badge ${b.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 muted'}`}>{b.active ? 'Active' : 'Archived'}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => editBatch(b.id)} className="btn-ghost rounded-lg px-3 py-1.5 text-[11px] font-bold">Edit</button>
              <button onClick={() => toggleActive(b.id)} className="btn-ghost rounded-lg px-3 py-1.5 text-[11px] font-bold">{b.active ? 'Archive' : 'Reactivate'}</button>
              <button onClick={() => deleteBatch(b.id)} className="rounded-lg px-3 py-1.5 text-[11px] font-bold bg-red-600 text-white">Delete</button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={addBatch} className="btn-gold rounded-lg px-4 py-2 text-xs font-bold">+ Add New Batch</button>
    </div>
  );
}
