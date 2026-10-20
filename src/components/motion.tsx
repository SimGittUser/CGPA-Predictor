import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A number that glides to its new value instead of jumping (e.g. SGPA 7.82 → 8.10). */
export function AnimatedNumber({ value, format, duration = 450 }: { value: number; format: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const frame = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(value) || !Number.isFinite(from.current) || reducedMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    cancelAnimationFrame(frame.current);
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = a + (value - a) * eased;
      from.current = v;
      setShown(v);
      if (k < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, duration]);

  return <>{format(shown)}</>;
}

/** Play the element's exit animation, then run `then` (e.g. actually delete it). */
export function animateOut(el: Element | null | undefined, then: () => void, ms = 200) {
  if (!el || reducedMotion()) return then();
  el.classList.add('exiting');
  setTimeout(() => {
    then();
    // The element may stay on screen (e.g. the page after "Delete everything"), so let it show again.
    requestAnimationFrame(() => el.classList.remove('exiting'));
  }, ms);
}

// ---- Confirm dialog (replaces the browser's plain confirm/alert pop-ups) ----------------

interface AskOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string | null;
  danger?: boolean;
}

type Ask = (o: AskOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask>(async () => true);

export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<(AskOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [closing, setClosing] = useState(false);
  const confirmBtn = useRef<HTMLButtonElement>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);

  const ask = useCallback<Ask>((o) => new Promise((resolve) => setOpen({ ...o, resolve })), []);

  const close = useCallback(
    (v: boolean) => {
      if (!open) return;
      setClosing(true);
      setTimeout(
        () => {
          open.resolve(v);
          setOpen(null);
          setClosing(false);
        },
        reducedMotion() ? 0 : 160,
      );
    },
    [open],
  );

  useEffect(() => {
    if (!open) return;
    // For something destructive, Enter shouldn't go straight to "Delete".
    (open.danger && cancelBtn.current ? cancelBtn.current : confirmBtn.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, close]);

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {open && (
        <div className={`dialog-backdrop ${closing ? 'closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
            <h3 id="dialog-title">{open.title}</h3>
            {open.body && <div className="dialog-body">{open.body}</div>}
            <div className="dialog-actions">
              {open.cancelLabel !== null && (
                <button ref={cancelBtn} type="button" className="btn ghost" onClick={() => close(false)}>
                  {open.cancelLabel ?? 'Cancel'}
                </button>
              )}
              <button ref={confirmBtn} type="button" className={`btn ${open.danger ? 'btn-danger' : 'primary'}`} onClick={() => close(true)}>
                {open.confirmLabel ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
