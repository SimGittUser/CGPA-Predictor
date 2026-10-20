import { useState } from 'react';
import { TEMPLATES, newPastSemester, subjectsFromTemplate, type Template } from '../lib/factory';
import type { AppState } from '../lib/types';
import { ImportFlow } from './Import';
import { Card, Icon, NumberField } from './ui';

type Step = 'pick' | 'past';

/** First visit: upload a screenshot → check the marks → results. Typing marks by hand is the fallback. */
export function Welcome({ state, update }: { state: AppState; update: (fn: (s: AppState) => AppState) => void }) {
  const [manual, setManual] = useState(false);
  if (manual) return <ManualSetup update={update} onBack={() => setManual(false)} />;
  return (
    <ImportFlow
      state={state}
      update={update}
      firstTime
      onManual={() => {
        setManual(true);
        window.scrollTo(0, 0);
      }}
      onDone={() => {
        location.hash = '#/';
      }}
      intro={
        <Card className="hello">
          <h2>Welcome! 👋</h2>
          <p>Find out what grades you're heading for, and how many marks you need in your final exams to hit your goal.</p>
          <ul className="hello-list">
            <li>
              <span className="hello-num">1</span> Upload a screenshot of your marks from CUIMS.
            </li>
            <li>
              <span className="hello-num">2</span> Check we read them right.
            </li>
            <li>
              <span className="hello-num">3</span> See your expected SGPA and CGPA, and what you need in each final exam.
            </li>
          </ul>
          <p className="muted small">No sign-up. Your marks stay on this device and save by themselves.</p>
        </Card>
      }
    />
  );
}

/** Pick a semester template and type marks by hand. */
function ManualSetup({ update, onBack }: { update: (fn: (s: AppState) => AppState) => void; onBack: () => void }) {
  const [step, setStepRaw] = useState<Step>('pick');
  const setStep = (st: Step) => {
    setStepRaw(st);
    window.scrollTo(0, 0);
  };
  const [tpl, setTpl] = useState<Template | null>(null);
  const [prevSgpa, setPrevSgpa] = useState<number | null>(null);
  const [prevCredits, setPrevCredits] = useState<number | null>(21);

  // The goal is asked next (GoalStep), once the subjects exist.
  const finish = (t: Template | null, prev: number | null) => {
    if (!t) location.hash = '#/add';
    update((s) => ({
      ...s,
      setupDone: true,
      semesterName: t?.title ?? 'My semester',
      subjects: t ? subjectsFromTemplate(t) : [],
      pastSemesters:
        t && t.semester > 1 && prev !== null ? [newPastSemester(1, { sgpa: prev, credits: prevCredits ?? t.prevCredits })] : s.pastSemesters,
    }));
  };

  return (
    <div className="stack welcome">
      {step === 'pick' && (
        <>
          <button type="button" className="btn ghost back-inline" onClick={onBack}>
            <Icon name="back" /> Back to uploading a screenshot
          </button>
          <div className="step-label">
            <b>Which semester are you in?</b>
          </div>
          <p className="muted small step-help">
            Your batch is split into two groups that study different subjects. Pick the one that matches your timetable.
          </p>
          <div className="tpl-grid">
            {TEMPLATES.map((t) => (
              <button
                type="button"
                key={t.id}
                className="tpl"
                onClick={() => {
                  setTpl(t);
                  setPrevCredits(t.prevCredits);
                  if (t.semester > 1) setStep('past');
                  else finish(t, null);
                }}
              >
                <span className="tpl-title">{t.title}</span>
                <span className="tpl-tell">{t.tellApart}</span>
                <span className="tpl-subjects">{t.subjects.map((x) => x.name).join(' · ')}</span>
                <span className="tpl-go">
                  Choose this <Icon name="chev" />
                </span>
              </button>
            ))}
            <button
              type="button"
              className="tpl tpl-other"
              onClick={() => finish(null, null)}
            >
              <span className="tpl-title">My semester isn't listed</span>
              <span className="tpl-tell">You'll add your subjects one by one. It only takes a minute.</span>
              <span className="tpl-go">
                Add my own subjects <Icon name="chev" />
              </span>
            </button>
          </div>
        </>
      )}

      {step === 'past' && tpl && (
        <Card>
          <h2>{tpl.semester > 2 ? "What's your CGPA so far?" : 'What was your 1st semester SGPA?'}</h2>
          <p className="muted">It's on your result in CUIMS. We use it to work out your CGPA. Don't know it? Just skip.</p>
          <div className="big-field">
            <label>{tpl.semester > 2 ? 'CGPA so far' : '1st semester SGPA'}</label>
            <NumberField value={prevSgpa} min={0} max={10} placeholder="e.g. 7.86" onChange={setPrevSgpa} className="big-input" label={tpl.semester > 2 ? 'CGPA so far' : '1st semester SGPA'} />
          </div>
          <div className="big-field">
            <label>{tpl.semester > 2 ? 'Credits completed so far' : 'Credits in that semester'}</label>
            <NumberField value={prevCredits} min={1} max={250} placeholder={String(tpl.prevCredits ?? 21)} onChange={setPrevCredits} className="big-input small-w" label="Credits" />
            <span className="muted small">Leave this as {tpl.prevCredits} unless your result shows something different.</span>
          </div>
          <div className="wizard-nav">
            <button type="button" className="btn ghost" onClick={() => setStep('pick')}>
              <Icon name="back" /> Back
            </button>
            <span className="grow" />
            <button
              type="button"
              className="btn"
              onClick={() => finish(tpl, null)}
            >
              Skip
            </button>
            <button type="button" className="btn primary" onClick={() => finish(tpl, prevSgpa)}>
              Next
            </button>
          </div>
        </Card>
      )}

    </div>
  );
}
