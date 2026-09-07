import React, { useMemo, useState } from 'react';
import { Search, Repeat, BarChart2, Lock, Play } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SUBCATEGORIES } from '../lib/utils';
import ExamFlow from '../components/exam/ExamFlow';
import AttemptSelector from '../components/exam/AttemptSelector';
import ResultScreen from '../components/exam/ResultScreen';
import ReviewScreen from '../components/exam/ReviewScreen';

const SUBJECTS = [['math', 'Math'], ['english', 'English'], ['reasoning', 'Reasoning'], ['gk', 'GK'], ['science', 'Science'], ['full', 'Full Mock']];

// Mirrors: userAdmin || isFree || (adminUnlocked && userEnrolled).
function canAccessMock(mock, isEnrolled, admin) {
  const isFree = mock.isDemo === true || mock.price === 0;
  const adminUnlocked = mock.adminUnlocked === true;
  return !!(admin || isFree || (adminUnlocked && isEnrolled()));
}

export default function MockTest() {
  const { DB, user, hasFullAccess, isEnrolled, openModal } = useApp();
  const [subjectTab, setSubjectTab] = useState('math');
  const [searchQ, setSearchQ] = useState('');
  const [examFilter, setExamFilter] = useState('all');
  const [subCategory, setSubCategory] = useState('all');

  const [activeSession, setActiveSession] = useState(null); // { test, source, subject }
  const [attemptPicker, setAttemptPicker] = useState(null); // array of submissions
  const [standaloneResult, setStandaloneResult] = useState(null); // submission shown outside ExamFlow
  const [standaloneReview, setStandaloneReview] = useState(false);

  const tests = useMemo(() => {
    let list = DB.mockTests[subjectTab] || [];
    if (searchQ.trim()) list = list.filter((t) => t.title.toLowerCase().includes(searchQ.trim().toLowerCase()));
    if (examFilter !== 'all') list = list.filter((t) => (t.examCategory || 'All Exams') === examFilter || (t.examCategory || 'All Exams') === 'All Exams');
    if (subCategory !== 'all') list = list.filter((t) => t.subCategory === subCategory);
    return list;
  }, [DB.mockTests, subjectTab, searchQ, examFilter, subCategory]);

  const startTest = (test) => {
    if (!user) { alert('Please login to start the test (attempts are tracked in your dashboard).'); openModal('login'); return; }
    setActiveSession({ test, source: 'mock', subject: subjectTab });
  };

  const openAnalysis = (testId) => {
    const subs = DB.submissions.filter((s) => s.testId === testId && user && s.studentId === user.id).sort((a, b) => b.attempt - a.attempt);
    if (!subs.length) { alert('No attempt found for this test yet.'); return; }
    setAttemptPicker(subs);
  };

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="font-display font-800 text-2xl mb-1">Mock Tests <span className="gold-text">CBT Engine</span></h2>
          <p className="muted text-sm">TCS iON / SSC CBT style — free demo mock in every subject, rest unlocked for enrolled batch students only.</p>
        </div>
        <span className="badge bg-red-500/15 text-red-400 w-fit">🔒 Paid / Enrolled Students Only (except Free Demo)</span>
      </div>

      <div className="flex flex-col md:flex-row md:flex-wrap gap-3 mb-3">
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1 flex-1 min-w-0">
          {SUBJECTS.map(([id, label]) => (
            <button key={id} onClick={() => { setSubjectTab(id); setSubCategory('all'); }} className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${subjectTab === id ? 'tab-active' : 'card2 muted'}`}>{label}</button>
          ))}
        </div>
        <select value={examFilter} onChange={(e) => setExamFilter(e.target.value)} className="rounded-lg px-3 py-2 text-xs w-full md:w-auto md:shrink-0">
          <option value="all">All Exam Categories</option>
          {DB.examCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="relative w-full md:w-64 md:shrink-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 muted" />
          <input type="text" placeholder="Search test title..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} className="w-full rounded-lg pl-9 pr-3 py-2 text-xs" />
        </div>
      </div>

      {SUBCATEGORIES[subjectTab] && (
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1 mb-6">
          <button onClick={() => setSubCategory('all')} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${subCategory === 'all' ? 'tab-active' : 'card2 muted'}`}>All</button>
          {SUBCATEGORIES[subjectTab].map((sc) => (
            <button key={sc} onClick={() => setSubCategory(sc)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${subCategory === sc ? 'tab-active' : 'card2 muted'}`}>{sc}</button>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tests.length ? tests.map((t) => {
          const locked = !canAccessMock(t, isEnrolled, hasFullAccess);
          const attempts = DB.submissions.filter((s) => s.testId === t.id && user && s.studentId === user.id).length;
          return (
            <div key={t.id} className="card glow-border rounded-2xl p-5 flex flex-col">
              <div className="flex justify-between items-start mb-2 gap-2 flex-wrap">
                <span className={`badge ${t.isDemo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/15 gold-text'}`}>{t.isDemo ? 'FREE DEMO' : 'PREMIUM'}</span>
                {t.subCategory && <span className="badge bg-purple-500/15 text-purple-400">{t.subCategory}</span>}
                {t.examCategory && t.examCategory !== 'All Exams' && <span className="badge bg-sky-500/15 text-sky-400">{t.examCategory}</span>}
                {(t.adminUnlocked && !t.isDemo && !locked) && <span className="badge bg-sky-500/20 text-sky-400">🔓 Unlocked for Enrolled Students</span>}
                {locked && <span className="badge bg-red-500/15 text-red-400">🔒 Locked</span>}
              </div>
              <h3 className="font-display font-700 text-sm mb-1">{t.title}</h3>
              <p className="text-xs muted mb-3">{t.questions.length} Questions • {t.durationMin} min • +{t.marksCorrect}/-{t.marksWrong}</p>
              {attempts > 0 && <p className="text-[11px] muted mb-2">Attempts so far: <span className="gold-text font-semibold">{attempts}</span></p>}
              {(attempts > 0 && !locked) ? (
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <button onClick={() => startTest(t)} className="btn-gold rounded-lg py-2.5 text-xs font-bold flex items-center justify-center gap-1"><Repeat className="w-3.5 h-3.5" />Re-attempt</button>
                  <button onClick={() => openAnalysis(t.id)} className="btn-ghost rounded-lg py-2.5 text-xs font-bold flex items-center justify-center gap-1"><BarChart2 className="w-3.5 h-3.5" />Analysis</button>
                </div>
              ) : (
                <button
                  onClick={() => (locked ? openModal('enroll', { context: 'locked' }) : startTest(t))}
                  className={`mt-auto rounded-lg py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 ${locked ? 'btn-ghost' : 'btn-gold'}`}
                >
                  {locked ? <Lock className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {locked ? 'Enroll in Batch to Unlock' : 'Start Test'}
                </button>
              )}
            </div>
          );
        }) : <p className="muted text-sm col-span-full">No tests match your search.</p>}
      </div>

      {activeSession && (
        <ExamFlow test={activeSession.test} source={activeSession.source} subject={activeSession.subject} onClose={() => setActiveSession(null)} />
      )}
      {attemptPicker && (
        <AttemptSelector submissions={attemptPicker} onClose={() => setAttemptPicker(null)} onPick={(s) => { setAttemptPicker(null); setStandaloneResult(s); }} />
      )}
      {standaloneResult && !standaloneReview && (
        <ResultScreen
          submission={standaloneResult} autoTimeout={false} autoViolation={false}
          onReview={() => setStandaloneReview(true)}
          onReattempt={() => { const t = (DB.mockTests[standaloneResult.subject] || []).find((x) => x.id === standaloneResult.testId); setStandaloneResult(null); if (t) setActiveSession({ test: t, source: 'mock', subject: standaloneResult.subject }); }}
          onClose={() => setStandaloneResult(null)}
        />
      )}
      {standaloneResult && standaloneReview && (
        <ReviewScreen submission={standaloneResult} onBackToSummary={() => setStandaloneReview(false)} onClose={() => { setStandaloneReview(false); setStandaloneResult(null); }} />
      )}
    </div>
  );
}
