import React, { useState } from 'react';
import { Zap, Repeat, BarChart2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { shuffle, resolveCorrectKey } from '../lib/examEngine';
import ExamFlow from '../components/exam/ExamFlow';
import AttemptSelector from '../components/exam/AttemptSelector';
import ResultScreen from '../components/exam/ResultScreen';
import ReviewScreen from '../components/exam/ReviewScreen';

const QUIZ_LENGTHS = [5, 10, 15, 20];

export default function Quiz() {
  const { DB, user, openModal } = useApp();
  const [activeSession, setActiveSession] = useState(null); // { test, source: 'quiz' }
  const [attemptPicker, setAttemptPicker] = useState(null);
  const [standaloneResult, setStandaloneResult] = useState(null);
  const [standaloneReview, setStandaloneReview] = useState(false);

  const startQuiz = (qCount, mins) => {
    if (!user) { alert('Please login to start the quiz.'); openModal('login'); return; }
    const gkOnly = DB.quizPool.filter((q) => q.subject === 'gk');
    if (!gkOnly.length) { alert('No GK questions are available yet. Please check back soon.'); return; }
    const pool = shuffle(gkOnly).slice(0, Math.min(qCount, gkOnly.length)).map((q) => ({ ...q, correct: resolveCorrectKey(q) }));
    const test = {
      id: 'quiz_' + qCount, title: `Quick Quiz — GK — ${pool.length} Questions`,
      durationMin: mins, marksCorrect: 1, marksWrong: 0.25, questions: pool,
    };
    setActiveSession({ test, source: 'quiz' });
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
          <h2 className="font-display font-800 text-2xl mb-1">Dynamic <span className="gold-text">Quick Quiz</span></h2>
          <p className="muted text-sm">General Knowledge &amp; Current Affairs only — questions are pulled randomly from the GK question bank.</p>
        </div>
        <span className="badge bg-emerald-500/20 text-emerald-400 w-fit">✅ 100% FREE — Open for All Visitors</span>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {QUIZ_LENGTHS.map((q) => {
          const mins = DB.quizDurations[String(q)] || Math.ceil(q * 0.6);
          const testId = 'quiz_' + q;
          const attempts = user ? DB.submissions.filter((s) => s.testId === testId && s.studentId === user.id).length : 0;
          return (
            <div key={q} className="card glow-border rounded-2xl p-5 text-center">
              <Zap className="w-6 h-6 gold-text mx-auto mb-2" />
              <p className="font-display font-800 text-xl">{q} Qs</p>
              <p className="text-xs muted mb-4">{mins} minutes</p>
              {attempts > 0 && <p className="text-[11px] muted mb-2">Attempts so far: <span className="gold-text font-semibold">{attempts}</span></p>}
              {attempts > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => startQuiz(q, mins)} className="btn-gold rounded-lg py-2.5 text-xs font-bold flex items-center justify-center gap-1"><Repeat className="w-3.5 h-3.5" />Re-attempt</button>
                  <button onClick={() => openAnalysis(testId)} className="btn-ghost rounded-lg py-2.5 text-xs font-bold flex items-center justify-center gap-1"><BarChart2 className="w-3.5 h-3.5" />Analysis</button>
                </div>
              ) : (
                <button onClick={() => startQuiz(q, mins)} className="w-full btn-gold rounded-lg py-2.5 text-xs font-bold">Start Quiz</button>
              )}
            </div>
          );
        })}
      </div>

      {activeSession && (
        <ExamFlow test={activeSession.test} source={activeSession.source} onClose={() => setActiveSession(null)} />
      )}
      {attemptPicker && (
        <AttemptSelector submissions={attemptPicker} onClose={() => setAttemptPicker(null)} onPick={(s) => { setAttemptPicker(null); setStandaloneResult(s); }} />
      )}
      {standaloneResult && !standaloneReview && (
        <ResultScreen
          submission={standaloneResult} autoTimeout={false} autoViolation={false}
          onReview={() => setStandaloneReview(true)}
          onReattempt={() => {
            const qCount = standaloneResult.detail.length;
            const mins = DB.quizDurations[String(qCount)] || Math.ceil(qCount * 0.6);
            setStandaloneResult(null); startQuiz(qCount, mins);
          }}
          onClose={() => setStandaloneResult(null)}
        />
      )}
      {standaloneResult && standaloneReview && (
        <ReviewScreen submission={standaloneResult} onBackToSummary={() => setStandaloneReview(false)} onClose={() => { setStandaloneReview(false); setStandaloneResult(null); }} />
      )}
    </div>
  );
}
