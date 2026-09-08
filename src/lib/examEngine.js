// Pure logic for the shared CBT exam engine (Mock Tests / PYQ / Quiz). No DOM access, no
// globals — everything here takes its state as arguments, so it's usable from a React hook
// or a test file equally. Ported from index.html lines ~1484-1493, 1848-1972, 2157-2193.
import { uid, isExemptEmail } from './utils';

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function findTestById(DB, testId, source, subject) {
  if (source === 'mock') return (DB.mockTests[subject] || []).find((t) => t.id === testId);
  if (source === 'pyq') return DB.pyqSets.find((t) => t.id === testId);
  return null;
}

export function resumeKey(userId) { return userId ? 'tce_exam_resume_' + userId : null; }

export function loadResumeData(userId) {
  const rk = resumeKey(userId);
  if (!rk) return null;
  try { return JSON.parse(localStorage.getItem(rk) || 'null'); } catch { return null; }
}
export function saveExamProgress(userId, examState) {
  const rk = resumeKey(userId);
  if (!rk || !examState) return;
  const { timer, ...toSave } = examState;
  localStorage.setItem(rk, JSON.stringify(toSave));
}
export function clearExamProgress(userId) {
  const rk = resumeKey(userId);
  if (rk) localStorage.removeItem(rk);
}

// Builds the initial exam state for a fresh attempt (mirrors beginExam()).
export function createExamState(test, source, subject, chosenLang) {
  const shuffledQ = shuffle(test.questions);
  const status = new Array(shuffledQ.length).fill('not-visited');
  status[0] = 'not-answered';
  return {
    testId: test.id, source, subject: subject || test.subject || 'pyq', title: test.title,
    durationSec: test.durationMin * 60, remaining: test.durationMin * 60,
    marksCorrect: test.marksCorrect, marksWrong: test.marksWrong, questions: shuffledQ,
    answers: new Array(shuffledQ.length).fill(null), status,
    timeSpent: new Array(shuffledQ.length).fill(0), questionEnteredAt: Date.now(),
    current: 0, violations: 0, lang: chosenLang, startedAt: Date.now(),
  };
}

// Normalizes a question's "correct answer" field to an option key ('A'/'B'/'C'/'D'), however
// it was originally recorded (letter, 0-based index, or matched by option text) — used by both
// Quick Quiz (GK pool questions may predate the 'correct' field convention) and the Admin bulk
// question uploader. Ported verbatim from index.html lines ~2951-2966.
export function resolveCorrectKey(q) {
  let c = q.correct;
  if (c === undefined || c === null || c === '') {
    c = q.correctAnswer !== undefined ? q.correctAnswer : (q.answer !== undefined ? q.answer : (q.correctIndex !== undefined ? q.correctIndex : q.correctOption));
  }
  if (typeof c === 'number' && c >= 0 && c <= 3) return String.fromCharCode(65 + c);
  if (typeof c === 'string') {
    const t = c.trim();
    if (/^[A-Da-d]$/.test(t)) return t.toUpperCase();
    if (/^[0-3]$/.test(t)) return String.fromCharCode(65 + parseInt(t, 10));
    const opts = q.options || [];
    const match = opts.find((o) => (o.textEn || o.text || '').trim().toLowerCase() === t.toLowerCase());
    if (match) return match.key || String.fromCharCode(65 + opts.indexOf(match));
  }
  return 'A';
}

export function sectionDisplayName(subject) {
  const map = { math: 'Elementary Mathematics', english: 'English Language', reasoning: 'General Reasoning', gk: 'General Knowledge', full: 'Combined Section', quiz: 'General Knowledge', pyq: 'Previous Year Section' };
  return map[subject] || (subject ? subject.charAt(0).toUpperCase() + subject.slice(1) : 'Section');
}

// Quiz duration formula: ~30 seconds per question, rounded up to the nearest whole minute.
// Matches the requested presets exactly (5→3, 10→5, 15→8, 20→10) and extends the same rule to
// any custom question count the student enters.
export function quizDurationMinutes(questionCount) {
  return Math.max(1, Math.ceil(questionCount * 0.5));
}

// Scores a finished exam and builds the submission record (mirrors finishExam()'s scoring half).
export function buildSubmission(examState, DB, user) {
  const st = examState;
  let correct = 0, wrong = 0, unanswered = 0;
  st.questions.forEach((q, i) => {
    if (st.answers[i] === null || st.answers[i] === undefined) unanswered++;
    else if (st.answers[i] === q.correct) correct++; else wrong++;
  });
  const score = +(correct * st.marksCorrect - wrong * st.marksWrong).toFixed(2);
  const maxScore = +(st.questions.length * st.marksCorrect).toFixed(2);
  const accuracy = (correct + wrong) > 0 ? +((correct / (correct + wrong)) * 100).toFixed(1) : 0;
  const attemptNo = DB.submissions.filter((s) => s.testId === st.testId && s.studentId === user.id).length + 1;
  const timeTakenSec = st.durationSec - st.remaining;
  return {
    id: uid('sub'), testId: st.testId, testType: st.source || 'mock', subject: st.subject, testTitle: st.title,
    studentId: user.id, studentName: user.name, studentPhone: user.phone || '', studentEmail: user.email || '',
    attempt: attemptNo, score, maxScore, correct, wrong, unanswered, accuracy, timeTakenSec, durationSec: st.durationSec,
    date: new Date().toISOString(),
    detail: st.questions.map((q, i) => ({ q, given: st.answers[i], timeSpent: st.timeSpent[i] || 0 })),
  };
}

// Excludes the 4 exempt mentor/admin accounts (see EXEMPT_ADMIN_EMAILS in utils.js) from the
// public leaderboard shown to real students — those accounts are for content review, not
// competing students, so they shouldn't appear ranked alongside them.
export function buildLeaderboard(submissions, testId) {
  return submissions.filter((s) => s.testId === testId && !isExemptEmail(s.studentEmail))
    .reduce((acc, s) => {
      const ex = acc.find((a) => a.studentId === s.studentId);
      if (!ex || s.score > ex.score) { acc = acc.filter((a) => a.studentId !== s.studentId); acc.push(s); }
      return acc;
    }, [])
    .sort((a, b) => b.score - a.score);
}

// Also excludes exempt accounts, so their test-content-review attempts never skew the
// "X% of students answered this correctly" stat shown to real students.
export function computeCommunityAccuracy(submissions, testId, questionId) {
  const subs = submissions.filter((s) => s.testId === testId && !isExemptEmail(s.studentEmail));
  let attempted = 0, correct = 0;
  subs.forEach((s) => {
    const d = (s.detail || []).find((x) => x.q && x.q.id === questionId);
    if (d && d.given) { attempted++; if (d.given === d.q.correct) correct++; }
  });
  return attempted > 0 ? Math.round((correct / attempted) * 100) : null;
}

export function classifySpeed(timeSpent, expectedPerQ, isCorrect, attempted) {
  if (!attempted) return null;
  const ratio = expectedPerQ > 0 ? timeSpent / expectedPerQ : 1;
  if (isCorrect) {
    if (ratio <= 0.6) return { label: 'Superfast', icon: 'zap', color: 'text-emerald-400' };
    if (ratio <= 1.4) return { label: 'On Time', icon: 'check-circle', color: 'text-sky-400' };
    return { label: 'Slow', icon: 'clock', color: 'text-amber-400' };
  }
  if (ratio <= 1.4) return { label: 'On Time but not Correct', icon: 'alert-circle', color: 'text-red-400' };
  return { label: 'Slow', icon: 'clock', color: 'text-amber-400' };
}

export function fmtReviewTime(secs) {
  const m = Math.floor((secs || 0) / 60), s = Math.round((secs || 0) % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* Branded Scorecard (canvas-based image) — ported from drawScorecardCanvas() verbatim. */
export function drawScorecardCanvas(sub, rank) {
  const canvas = document.createElement('canvas');
  canvas.width = 900; canvas.height = 550;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 900, 550);
  grad.addColorStop(0, '#0B0B0B'); grad.addColorStop(1, '#161f2e');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 900, 550);
  const goldGrad = ctx.createLinearGradient(0, 0, 900, 0);
  goldGrad.addColorStop(0, '#F59E0B'); goldGrad.addColorStop(0.5, '#D97706'); goldGrad.addColorStop(1, '#FBBF24');
  ctx.fillStyle = goldGrad; ctx.fillRect(0, 0, 900, 10);
  ctx.fillStyle = goldGrad; ctx.font = 'bold 34px Arial'; ctx.fillText('TCE - The Competitive Edge', 40, 70);
  ctx.fillStyle = '#94A3B8'; ctx.font = '16px Arial'; ctx.fillText('Official Score Card', 40, 100);
  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 26px Arial'; ctx.fillText(sub.testTitle, 40, 160);
  ctx.fillStyle = '#94A3B8'; ctx.font = '16px Arial'; ctx.fillText('Candidate: ' + sub.studentName + '   |   Attempt #' + sub.attempt, 40, 195);
  const stats = [['Score', sub.score + ' / ' + sub.maxScore], ['Rank', '#' + rank], ['Accuracy', sub.accuracy + '%'], ['Correct/Wrong', sub.correct + ' / ' + sub.wrong]];
  stats.forEach((s, i) => {
    const x = 40 + (i % 2) * 430, y = 250 + Math.floor(i / 2) * 110;
    ctx.strokeStyle = 'rgba(217,119,6,0.4)'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, 400, 90);
    ctx.fillStyle = '#94A3B8'; ctx.font = '14px Arial'; ctx.fillText(s[0].toUpperCase(), x + 20, y + 30);
    ctx.fillStyle = goldGrad; ctx.font = 'bold 32px Arial'; ctx.fillText(String(s[1]), x + 20, y + 68);
  });
  ctx.fillStyle = '#94A3B8'; ctx.font = '13px Arial';
  ctx.fillText('Near Nahata Anchal, Nahata, P.S. Gopalnagar, North 24 Parganas, West Bengal - 743290', 40, 520);
  return canvas;
}
export function downloadScorecard(sub, rank) {
  const canvas = drawScorecardCanvas(sub, rank);
  const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'TCE_Scorecard_' + sub.studentName.replace(/\s+/g, '_') + '.png'; a.click();
}
/* Offline printable question paper — ported from printOfflinePaper() (lines ~2997-3022). */
export function printOfflinePaper(test) {
  if (!test) return;
  const html = `
  <div style="font-family:Arial, sans-serif; color:#000; padding:20px; max-width:800px; margin:0 auto;">
    <h2 style="text-align:center;margin-bottom:4px;">TCE - The Competitive Edge</h2>
    <p style="text-align:center;margin-top:0;font-size:12px;">Near Nahata Anchal, Nahata, P.S. Gopalnagar, North 24 Parganas, West Bengal - 743290</p>
    <hr>
    <h3>${test.title}</h3>
    <p style="font-size:13px;">Duration: ${test.durationMin} min &nbsp; | &nbsp; Marks: +${test.marksCorrect} / -${test.marksWrong} &nbsp; | &nbsp; Total Questions: ${test.questions.length}</p>
    <p style="font-size:12px;">Name: ______________________ &nbsp; Roll No: ____________ &nbsp; Date: ____________</p>
    <hr>
    ${test.questions.map((q, i) => `
      <div style="margin-bottom:14px; page-break-inside:avoid;">
        <p style="font-weight:bold; margin-bottom:4px;">${i + 1}. ${q.textEn} ${q.textBn ? ('&nbsp; / ' + q.textBn) : ''}</p>
        <div style="display:flex; flex-wrap:wrap; gap:16px; font-size:13px;">
          ${q.options.map((o) => `<span>(${o.key}) ${o.textEn}</span>`).join('')}
        </div>
      </div>`).join('')}
    <hr>
    <p style="font-size:11px; text-align:center;">© TCE - The Competitive Edge | tcenahata@gmail.com | +91 73846 44030</p>
  </div>`;
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>${test.title} - Print</title></head><body>${html}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

export function shareScorecardWhatsApp(sub, rank) {
  downloadScorecard(sub, rank);
  const text = `My TCE Score Card 🏆\n${sub.testTitle}\nScore: ${sub.score}/${sub.maxScore} | Rank #${rank} | Accuracy: ${sub.accuracy}%\n- TCE The Competitive Edge`;
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}
