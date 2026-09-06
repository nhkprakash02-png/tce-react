import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { uid } from '../../lib/utils';
import { resolveCorrectKey } from '../../lib/examEngine';

const QUIZ_LENGTHS = ['5', '10', '15', '20'];
const EMPTY = { en: '', bn: '', a: '', b: '', c: '', d: '', correct: 'A', exp: '' };

export default function GkQuizManager() {
  const { DB, saveDB } = useApp();
  const [form, setForm] = useState(EMPTY);
  const [bulkJson, setBulkJson] = useState('');

  const gkQuestions = DB.quizPool.filter((q) => q.subject === 'gk');

  const updateQuizDuration = (qCount, minutes) => {
    const val = parseFloat(minutes);
    if (!(val > 0)) return;
    saveDB((prev) => ({ ...prev, quizDurations: { ...prev.quizDurations, [qCount]: val } }));
  };

  const addGkQuizQuestion = () => {
    const { en, bn, a, b, c, d, correct, exp } = form;
    if (!en.trim() || !a.trim() || !b.trim() || !c.trim() || !d.trim()) { alert('Please fill the question and all 4 options.'); return; }
    const q = { id: uid('q'), subject: 'gk', textEn: en.trim(), textBn: bn.trim(), options: [{ key: 'A', textEn: a.trim(), textBn: '' }, { key: 'B', textEn: b.trim(), textBn: '' }, { key: 'C', textEn: c.trim(), textBn: '' }, { key: 'D', textEn: d.trim(), textBn: '' }], correct, explanation: exp.trim(), solutionImg: '' };
    saveDB((prev) => ({ ...prev, quizPool: [...prev.quizPool, q] }));
    setForm(EMPTY);
  };

  const bulkUploadGkQuiz = () => {
    try {
      const arr = JSON.parse(bulkJson.trim());
      const newQs = arr.map((q) => ({ id: uid('q'), subject: 'gk', textEn: q.textEn || '', textBn: q.textBn || '', options: q.options || [], correct: resolveCorrectKey(q), explanation: q.explanation || '', solutionImg: q.solutionImg || '' }));
      saveDB((prev) => ({ ...prev, quizPool: [...prev.quizPool, ...newQs] }));
      setBulkJson('');
    } catch (e) { alert('Invalid JSON: ' + e.message); }
  };

  const deleteGkQuizQuestion = (qid) => {
    if (!confirm('Delete this GK question?')) return;
    saveDB((prev) => ({ ...prev, quizPool: prev.quizPool.filter((q) => q.id !== qid) }));
  };

  return (
    <div>
      <div className="card2 rounded-xl p-4 mb-4">
        <p className="text-xs font-bold muted uppercase mb-2">Quick Quiz Duration (minutes per mode)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          {QUIZ_LENGTHS.map((q) => (
            <div key={q}>
              <label className="text-[10px] muted block mb-1">{q} Questions</label>
              <input type="number" min="1" step="1" defaultValue={DB.quizDurations[q]} onBlur={(e) => updateQuizDuration(q, e.target.value)} className="w-full rounded-lg px-3 py-2 text-xs" />
            </div>
          ))}
        </div>
        <p className="text-[11px] muted">Sets the exact time limit (in minutes) students get for each Quick Quiz length.</p>
      </div>

      <div className="card2 rounded-xl p-4 mb-4">
        <p className="text-xs font-bold muted uppercase mb-2">Upload Quiz Questions (GK Only) — Single Entry</p>
        <div className="grid sm:grid-cols-2 gap-2 mb-2">
          <textarea value={form.en} onChange={(e) => setForm({ ...form, en: e.target.value })} rows={2} placeholder="Question (English)" className="rounded-lg px-3 py-2 text-xs" />
          <textarea value={form.bn} onChange={(e) => setForm({ ...form, bn: e.target.value })} rows={2} placeholder="প্রশ্ন (বাংলা) — optional" className="rounded-lg px-3 py-2 text-xs bn" />
        </div>
        <div className="grid sm:grid-cols-2 gap-2 mb-2">
          <input value={form.a} onChange={(e) => setForm({ ...form, a: e.target.value })} type="text" placeholder="Option A" className="rounded-lg px-3 py-2 text-xs" />
          <input value={form.b} onChange={(e) => setForm({ ...form, b: e.target.value })} type="text" placeholder="Option B" className="rounded-lg px-3 py-2 text-xs" />
          <input value={form.c} onChange={(e) => setForm({ ...form, c: e.target.value })} type="text" placeholder="Option C" className="rounded-lg px-3 py-2 text-xs" />
          <input value={form.d} onChange={(e) => setForm({ ...form, d: e.target.value })} type="text" placeholder="Option D" className="rounded-lg px-3 py-2 text-xs" />
        </div>
        <div className="grid sm:grid-cols-2 gap-2 mb-2">
          <select value={form.correct} onChange={(e) => setForm({ ...form, correct: e.target.value })} className="rounded-lg px-3 py-2 text-xs">
            <option>A</option><option>B</option><option>C</option><option>D</option>
          </select>
          <input value={form.exp} onChange={(e) => setForm({ ...form, exp: e.target.value })} type="text" placeholder="Explanation" className="rounded-lg px-3 py-2 text-xs" />
        </div>
        <button onClick={addGkQuizQuestion} className="btn-gold rounded-lg px-4 py-2 text-xs font-bold">+ Add to GK Quiz Pool</button>
      </div>

      <div className="card2 rounded-xl p-4 mb-4">
        <p className="text-xs font-bold muted uppercase mb-2">Bulk Copy-Paste Upload (JSON array, tag-free — always saved as GK)</p>
        <textarea value={bulkJson} onChange={(e) => setBulkJson(e.target.value)} rows={4} placeholder='[{"textEn":"...","options":[{"key":"A","textEn":"..."},...],"correct":"A","explanation":"..."}]' className="w-full rounded-lg px-3 py-2 text-xs font-mono" />
        <button onClick={bulkUploadGkQuiz} className="btn-gold rounded-lg px-4 py-2 text-xs font-bold mt-2">Upload Bulk to GK Quiz Pool</button>
      </div>

      <p className="text-xs font-bold muted uppercase mb-2">GK Quiz Pool ({gkQuestions.length} questions)</p>
      <div className="space-y-2">
        {gkQuestions.map((q, i) => (
          <div key={q.id} className="card rounded-lg p-3 flex justify-between items-start gap-3">
            <div><p className="text-xs font-medium">{i + 1}. {q.textEn}</p><p className="text-[10px] muted mt-1">Correct: {q.correct}</p></div>
            <button onClick={() => deleteGkQuizQuestion(q.id)} className="text-red-400"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
