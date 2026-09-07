import React, { useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '../../context/AppContext';
import { isExemptEmail } from '../../lib/utils';

const SUBJECTS = [['all', 'All Subjects'], ['math', 'Mathematics'], ['english', 'English'], ['reasoning', 'Reasoning'], ['gk', 'General Knowledge (GK)'], ['science', 'Science'], ['full', 'Full Combined Mock']];

export default function ResultsManager() {
  const { DB } = useApp();
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [testFilter, setTestFilter] = useState('all');

  const testOptions = subjectFilter === 'all' ? [] : (DB.mockTests[subjectFilter] || []);

  const ranked = useMemo(() => {
    // Exempt mentor/admin accounts (see EXEMPT_ADMIN_EMAILS) are left out of this results
    // dashboard too — their test-content-review attempts aren't real student results.
    let subs = DB.submissions.filter((s) => s.testType !== 'quiz' && s.testType !== 'pyq' && !isExemptEmail(s.studentEmail));
    if (subjectFilter !== 'all') subs = subs.filter((s) => s.subject === subjectFilter);
    if (testFilter !== 'all') subs = subs.filter((s) => s.testId === testFilter);
    return subs.slice().sort((a, b) => b.score - a.score || a.timeTakenSec - b.timeTakenSec);
  }, [DB.submissions, subjectFilter, testFilter]);

  const exportResultsExcel = () => {
    const rows = ranked.map((s, i) => ({ Rank: i + 1, Student: s.studentName, Phone: s.studentPhone, Test: s.testTitle, Attempt: s.attempt, Score: s.score, MaxScore: s.maxScore, Accuracy: s.accuracy, TimeTakenSec: s.timeTakenSec, Date: new Date(s.date).toLocaleString() }));
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MockResults'); XLSX.writeFile(wb, 'TCE_MockResults.xlsx');
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <select value={subjectFilter} onChange={(e) => { setSubjectFilter(e.target.value); setTestFilter('all'); }} className="rounded-lg px-3 py-2 text-xs">
          {SUBJECTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={testFilter} onChange={(e) => setTestFilter(e.target.value)} className="rounded-lg px-3 py-2 text-xs">
          <option value="all">All Tests</option>
          {testOptions.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        <button onClick={exportResultsExcel} className="btn-gold rounded-lg px-3 py-2 text-xs font-bold flex items-center gap-1.5 ml-auto"><FileSpreadsheet className="w-3.5 h-3.5" />Export Results</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="card2"><tr className="text-left muted"><th className="p-2">Rank</th><th className="p-2">Student</th><th className="p-2">Roll/Phone</th><th className="p-2">Test</th><th className="p-2">Score</th><th className="p-2">Accuracy</th><th className="p-2">Time Taken</th><th className="p-2">Submitted</th></tr></thead>
          <tbody>
            {ranked.length ? ranked.map((s, i) => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="p-2 gold-text font-bold">#{i + 1}</td><td className="p-2">{s.studentName}</td><td className="p-2">{s.studentPhone || '-'}</td>
                <td className="p-2">{s.testTitle} (Attempt #{s.attempt})</td>
                <td className="p-2 font-semibold">{s.score}/{s.maxScore}</td><td className="p-2">{s.accuracy}%</td>
                <td className="p-2">{Math.floor(s.timeTakenSec / 60)}m {s.timeTakenSec % 60}s</td><td className="p-2">{new Date(s.date).toLocaleString()}</td>
              </tr>
            )) : <tr><td className="p-2 muted" colSpan={8}>No matching mock test submissions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
