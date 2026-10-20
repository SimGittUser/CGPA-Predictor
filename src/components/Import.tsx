import { useRef, useState, type ReactNode } from 'react';
import { COURSE_TYPES } from '../lib/grading';
import { newPastSemester } from '../lib/factory';
import { GUESSED_CREDITS, applyDrafts, draftsFrom, parseLines, parseText, type DraftSubject, type ImportedRow } from '../lib/importer';
import { readScreenshots, type ReadProgress, type UploadedImage } from '../lib/ocr';
import type { AppState, CourseType } from '../lib/types';
import exampleShot from '../assets/cuims-marks-example.webp';
import { useConfirm } from './motion';
import { Card, Collapsible, Icon, NumberField } from './ui';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  /** First visit: ask for CGPA so far and offer the type-it-yourself route. */
  firstTime?: boolean;
  intro?: ReactNode;
  onManual?: () => void;
  onDone: () => void;
  onCancel?: () => void;
}

type Stage = 'upload' | 'reading' | 'review';

export function ImportFlow({ state, update, firstTime, intro, onManual, onDone, onCancel }: Props) {
  const [stage, setStage] = useState<Stage>('upload');
  const [progress, setProgress] = useState<ReadProgress>({ label: '', value: 0 });
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftSubject[]>([]);
  const [images, setImages] = useState<UploadedImage[]>([]);

  const go = (s: Stage) => {
    setStage(s);
    window.scrollTo(0, 0);
  };

  const found = (subjects: ReturnType<typeof parseText>) => {
    if (!subjects.length) {
      setError(
        "We couldn't find any marks there. Make sure the screenshot shows the table with “Exam Description”, “Max. Marks” and “Marks Obt.”, and that the subject names are in it.",
      );
      go('upload');
      return;
    }
    setError(null);
    setDrafts(draftsFrom(subjects, state.subjects));
    go('review');
  };

  const readFiles = async (files: File[]) => {
    const pics = files.filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|heic)$/i.test(f.name));
    if (!pics.length) {
      setError('That doesn’t look like a picture. Choose a screenshot (PNG or JPG).');
      return;
    }
    go('reading');
    try {
      const { lines, images } = await readScreenshots(pics, setProgress);
      setImages(images);
      found(parseLines(lines));
    } catch (e) {
      console.error(e);
      setError('Something went wrong while reading the screenshot. Check your internet connection (the reader downloads once), or paste the text instead.');
      go('upload');
    }
  };

  if (stage === 'reading') {
    return (
      <Card className="reading">
        <div className="step-label">Step 1 of 2</div>
        <h2>Reading your marks…</h2>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.value * 100)}>
          <div style={{ width: `${Math.max(4, progress.value * 100)}%` }} />
        </div>
        <p className="muted">{progress.label}</p>
        <p className="muted small">This happens on your device. Your screenshot isn't uploaded anywhere.</p>
      </Card>
    );
  }

  if (stage === 'review') {
    return (
      <Review
        drafts={drafts}
        setDrafts={setDrafts}
        images={images}
        state={state}
        firstTime={firstTime}
        onBack={() => go('upload')}
        onSave={(cgpa) => {
          update((s) => ({
            ...s,
            setupDone: true,
            subjects: applyDrafts(s.subjects, drafts),
            pastSemesters:
              cgpa.cgpa !== null && cgpa.credits !== null
                ? [...s.pastSemesters, newPastSemester(s.pastSemesters.length + 1, { name: 'Previous semesters (CGPA)', sgpa: cgpa.cgpa, credits: cgpa.credits })]
                : s.pastSemesters,
          }));
          window.scrollTo(0, 0);
          onDone();
        }}
      />
    );
  }

  return (
    <div className="stack">
      {intro}
      <Upload error={error} onFiles={readFiles} onText={(t) => found(parseText(t))} onCancel={onCancel} />
      {onManual && (
        <p className="center small muted">
          No marks yet, or no access to CUIMS?{' '}
          <button type="button" className="link" onClick={onManual}>
            Pick your semester and type marks yourself
          </button>
        </p>
      )}
    </div>
  );
}

// ---- Step 1: upload --------------------------------------------------------------------

function Upload({ error, onFiles, onText, onCancel }: { error: string | null; onFiles: (f: File[]) => void; onText: (t: string) => void; onCancel?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [text, setText] = useState('');

  return (
    <Card>
      {onCancel && (
        <button type="button" className="btn ghost back-inline" onClick={onCancel}>
          <Icon name="back" /> Back
        </button>
      )}
      <div className="step-label">Step 1 of 2</div>
      <h2>Upload a screenshot of your marks</h2>
      <p className="muted">
        Open <b>CUIMS</b> and go to <b>Marks View</b>, the page that lists your internal marks for every subject.
      </p>

      <div className="example">
        <div className="example-shots" aria-hidden>
          <figure className="shot-col">
            <div className="shot shot-long">
              <img src={exampleShot} alt="" />
            </div>
            <figcaption>One long screenshot</figcaption>
          </figure>
          <span className="example-or">or</span>
          <figure className="shot-col">
            <div className="shot-parts">
              <div className="shot shot-part shot-top">
                <img src={exampleShot} alt="" />
              </div>
              <div className="shot shot-part shot-bottom">
                <img src={exampleShot} alt="" />
              </div>
            </div>
            <figcaption>A few screenshots, in parts</figcaption>
          </figure>
        </div>
        <p className="example-text">
          Upload <b>one long screenshot</b> that shows all your marks, or <b>several screenshots in parts</b>. Most phones can take a long (scrolling)
          screenshot. If yours can't, just scroll down and take more than one.
        </p>
      </div>

      {error && <p className="note">{error}</p>}

      <label
        className={`dropzone ${drag ? 'drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          onFiles([...e.dataTransfer.files]);
        }}
      >
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) onFiles(files);
          }}
        />
        <span className="dz-icon" aria-hidden>
          📷
        </span>
        <span className="dz-main">Choose screenshot</span>
        <span className="small muted">Tap to pick from your photos. You can pick more than one.</span>
      </label>
      <p className="small muted center">Your screenshot is read on this device and never uploaded.</p>

      <Collapsible title="Can't take a screenshot? Paste the text instead">
        <p className="small muted">On CUIMS, select the whole marks table, copy it, and paste it here.</p>
        <textarea className="paste" value={text} placeholder={'Subject: Data Structures\nMST-1 Hybrid   20   15\n…'} onChange={(e) => setText(e.target.value)} rows={7} />
        <button type="button" className="btn primary" disabled={!text.trim()} onClick={() => onText(text)}>
          Read this text
        </button>
      </Collapsible>
    </Card>
  );
}

// ---- Step 2: review ----------------------------------------------------------------------

const TYPE_ORDER: CourseType[] = ['hybrid', 'practical', 'theory', 'external', 'custom'];

function Review({
  drafts,
  setDrafts,
  images,
  state,
  firstTime,
  onBack,
  onSave,
}: {
  drafts: DraftSubject[];
  setDrafts: (fn: (d: DraftSubject[]) => DraftSubject[]) => void;
  images: UploadedImage[];
  state: AppState;
  firstTime?: boolean;
  onBack: () => void;
  onSave: (cgpa: { cgpa: number | null; credits: number | null }) => void;
}) {
  const ask = useConfirm();
  const [cgpa, setCgpa] = useState<number | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const included = drafts.filter((d) => d.include);
  const marks = included.reduce((a, d) => a + d.rows.filter((r) => r.obtained !== null).length, 0);
  const flagged = included.reduce((a, d) => a + d.rows.filter((r) => r.flag).length, 0);
  const guessed = included.filter((d) => d.creditsGuessed).length;
  const askCgpa = firstTime && state.pastSemesters.length === 0;

  const setDraft = (id: string, fn: (d: DraftSubject) => DraftSubject) => setDrafts((ds) => ds.map((d) => (d.id === id ? fn(d) : d)));

  return (
    <div className="stack">
      <Card>
        <div className="step-label">Step 2 of 2</div>
        <h2>Check your marks</h2>
        <p>
          We found <b>{included.length}</b> subject{included.length === 1 ? '' : 's'} and <b>{marks}</b> mark{marks === 1 ? '' : 's'}. Compare them with your
          screenshot and fix anything that's wrong. Tap a number to change it.
        </p>
        {(flagged > 0 || guessed > 0) && (
          <ul className="review-todo">
            {flagged > 0 && (
              <li>
                <span className="dot warn" /> {flagged} number{flagged > 1 ? 's are' : ' is'} highlighted in yellow. Please check {flagged > 1 ? 'them' : 'it'}.
              </li>
            )}
            {guessed > 0 && (
              <li>
                <span className="dot warn" /> We guessed the credits for {guessed} subject{guessed > 1 ? 's' : ''}. Check them on CUIMS (they affect your SGPA).
              </li>
            )}
          </ul>
        )}
      </Card>

      {drafts.map((d) => (
        <DraftCard key={d.id} d={d} images={images} change={(fn) => setDraft(d.id, fn)} />
      ))}

      {askCgpa && (
        <Card>
          <h3>Your results so far (optional)</h3>
          <p className="muted small">
            Add your current CGPA to see where it's heading. It's on your result page in CUIMS. In your 1st semester? Skip this.
          </p>
          <div className="review-fields">
            <label>
              <span>CGPA so far</span>
              <NumberField value={cgpa} min={0} max={10} placeholder="e.g. 7.95" label="CGPA so far" onChange={setCgpa} />
            </label>
            <label>
              <span>Credits completed</span>
              <NumberField value={credits} min={1} max={250} placeholder="e.g. 44" label="Credits completed" onChange={setCredits} />
              <span className="small muted">1st year (two semesters) is usually 44.</span>
            </label>
          </div>
        </Card>
      )}

      <div className="review-actions">
        <button type="button" className="btn ghost" onClick={onBack}>
          <Icon name="back" /> Upload again
        </button>
        <button
          type="button"
          className="btn primary big"
          disabled={!included.length}
          onClick={async () => {
            if (
              flagged > 0 &&
              !(await ask({
                title: `${flagged} number${flagged > 1 ? 's' : ''} still highlighted`,
                body: 'We weren’t sure we read these right. Check them against your screenshot, or carry on if they look fine.',
                confirmLabel: 'They’re fine, continue',
                cancelLabel: 'Let me check',
              }))
            )
              return;
            onSave({ cgpa, credits: cgpa !== null ? credits : null });
          }}
        >
          Looks right. Show my results
        </button>
      </div>
    </div>
  );
}

function DraftCard({ d, images, change }: { d: DraftSubject; images: UploadedImage[]; change: (fn: (d: DraftSubject) => DraftSubject) => void }) {
  const setRow = (id: string, patch: Partial<ImportedRow>) => change((x) => ({ ...x, rows: x.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  return (
    <Card className={`draft ${d.include ? '' : 'excluded'}`}>
      <div className="draft-head">
        <input
          className={`draft-name ${d.name ? '' : 'bad'}`}
          value={d.name}
          placeholder="Type the subject name"
          aria-label="Subject name"
          onChange={(e) => change((x) => ({ ...x, name: e.target.value }))}
        />
        <span className={`tag ${d.existingId ? 'tag-update' : 'tag-new'}`}>{d.existingId ? 'Updates your subject' : 'New subject'}</span>
      </div>

      {d.include && (
        <>
          <div className="review-fields">
            <label>
              <span>Credits</span>
              <NumberField
                className={d.creditsGuessed ? 'guessed' : ''}
                value={d.credits}
                min={0}
                max={30}
                fallback={GUESSED_CREDITS[d.type]}
                label="Credits"
                onChange={(v) => change((x) => ({ ...x, credits: v, creditsGuessed: false }))}
              />
              {d.creditsGuessed && <span className="small warn-text">Our guess. Please check on CUIMS.</span>}
            </label>
            <label className="wide">
              <span>How is it marked?</span>
              <select value={d.type} onChange={(e) => change((x) => ({ ...x, type: e.target.value as CourseType }))}>
                {TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {COURSE_TYPES[t].label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="draft-rows">
            <div className="draft-row draft-row-head small muted" aria-hidden>
              <span>Test</span>
              <span>You got</span>
              <span />
              <span>Out of</span>
            </div>
            {d.rows.map((r) => (
              <div key={r.id} className={`draft-row-wrap ${r.flag ? 'flagged' : ''}`}>
                <div className="draft-row">
                  <span className="draft-desc">{r.description}</span>
                  <NumberField
                    className="draft-num"
                    value={r.obtained}
                    min={0}
                    placeholder="–"
                    label={`${r.description}: marks you got`}
                    onChange={(v) => setRow(r.id, { obtained: v, flag: null })}
                  />
                  <span className="muted">/</span>
                  <NumberField className="draft-num" value={r.max} min={1} label={`${r.description}: out of`} onChange={(v) => setRow(r.id, { max: v, flag: null })} />
                </div>
                {r.flag && (
                  <div className="draft-flag">
                    <span>{r.flag}</span>
                    {r.source && images[r.source.image]?.width > 0 && (
                      <span className="crop-wrap">
                        <span className="small">In your screenshot:</span>
                        <LineCrop img={images[r.source.image]} bbox={r.source.bbox} />
                      </span>
                    )}
                    {r.obtained !== null && (
                      <button type="button" className="btn small" onClick={() => setRow(r.id, { flag: null })}>
                        <Icon name="check" /> It's right
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <label className="check">
        <input type="checkbox" checked={!d.include} onChange={(e) => change((x) => ({ ...x, include: !e.target.checked }))} />
        <span>Don't add this subject</span>
      </label>
    </Card>
  );
}

/** The matching line cut out of the student's screenshot, so they can compare without switching apps. */
function LineCrop({ img, bbox }: { img: UploadedImage; bbox: { x0: number; y0: number; x1: number; y1: number } }) {
  const pad = 8;
  const x0 = Math.max(0, bbox.x0 - pad);
  const y0 = Math.max(0, bbox.y0 - pad);
  const w = Math.min(img.width, bbox.x1 + pad) - x0;
  const h = Math.min(img.height, bbox.y1 + pad) - y0;
  // Zoom in up to 2×, but never wider than a phone screen allows.
  const s = Math.min(2, 260 / w);
  return (
    <div className="crop" style={{ width: w * s, height: h * s }}>
      <img src={img.url} alt="These marks in your screenshot" style={{ width: img.width * s, left: -x0 * s, top: -y0 * s }} />
    </div>
  );
}
