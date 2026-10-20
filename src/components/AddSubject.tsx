import { useState } from 'react';
import { COURSE_TYPES } from '../lib/grading';
import { newSubject } from '../lib/factory';
import type { AppState, CourseType } from '../lib/types';
import { Card, Icon, NumberField } from './ui';

const ORDER: CourseType[] = ['hybrid', 'practical', 'theory', 'external', 'custom'];

export function AddSubject({ update, open, back }: { update: (fn: (s: AppState) => AppState) => void; open: (id: string) => void; back: () => void }) {
  const [name, setName] = useState('');
  const [credits, setCredits] = useState<number | null>(null);
  const [type, setType] = useState<CourseType | null>(null);
  const [internalMax, setInternalMax] = useState<number | null>(50);
  const [externalMax, setExternalMax] = useState<number | null>(50);
  const [tried, setTried] = useState(false);

  const missing = [!name.trim() && 'the subject name', credits === null && 'the credits', !type && 'how it is marked'].filter(Boolean);

  const save = () => {
    setTried(true);
    if (missing.length || !type) return;
    const s = newSubject({
      name: name.trim(),
      credits: credits ?? 1,
      type,
      ...(type === 'custom' ? { internalMax: internalMax ?? 0, externalMax: externalMax ?? 0 } : {}),
    });
    update((st) => ({ ...st, setupDone: true, subjects: [...st.subjects, s] }));
    open(s.id);
  };

  return (
    <div className="stack">
      <div className="detail-top">
        <button type="button" className="btn ghost" onClick={back}>
          <Icon name="back" /> Back
        </button>
      </div>
      <Card>
        <h2>Add a subject</h2>
        <p className="muted">Three quick questions. You'll get ready-made boxes to type your marks into.</p>

        <div className="big-field">
          <label htmlFor="new-name">1. What's the subject called?</label>
          <input id="new-name" className="big-input" value={name} placeholder="e.g. Data Structures" onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="big-field">
          <label>2. How many credits is it?</label>
          <NumberField className="big-input small-w" value={credits} min={0} max={30} placeholder="e.g. 4" label="Credits" onChange={setCredits} />
          <span className="muted small">It's in your timetable or the course list on CUIMS. Most subjects are 1 to 5 credits.</span>
        </div>

        <div className="big-field">
          <label>3. How is it marked?</label>
          <div className="type-options">
            {ORDER.map((t) => (
              <button type="button" key={t} className={`type-option ${type === t ? 'on' : ''}`} onClick={() => setType(t)}>
                <span className="type-radio" aria-hidden />
                <span>
                  <b>{COURSE_TYPES[t].label}</b>
                  <span className="small muted">{COURSE_TYPES[t].hint}</span>
                </span>
              </button>
            ))}
          </div>
          {type === 'custom' && (
            <div className="custom-split">
              <label>
                Internal marks
                <NumberField value={internalMax} min={0} max={100} label="Internal marks" onChange={setInternalMax} />
              </label>
              <label>
                Final exam marks
                <NumberField value={externalMax} min={0} max={100} label="Final exam marks" onChange={setExternalMax} />
              </label>
            </div>
          )}
        </div>

        {tried && missing.length > 0 && <p className="note">Please fill in {missing.join(', ')}.</p>}
        <button type="button" className="btn primary big full" onClick={save}>
          Add subject
        </button>
      </Card>
    </div>
  );
}
