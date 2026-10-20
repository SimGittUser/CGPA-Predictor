import type { SourceLine } from './importer';

export interface UploadedImage {
  url: string;
  width: number;
  height: number;
}

export interface ReadProgress {
  /** Plain-words status for the student. */
  label: string;
  /** 0–1 across all images. */
  value: number;
}

/** Small screenshots read better when enlarged first. */
const MIN_WIDTH = 700;

async function prepare(file: File): Promise<{ source: HTMLCanvasElement | File; scale: number; info: UploadedImage }> {
  const url = URL.createObjectURL(file);
  try {
    const bmp = await createImageBitmap(file);
    const scale = bmp.width < MIN_WIDTH ? 2 : 1;
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width * scale;
    canvas.height = bmp.height * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; // transparent PNGs otherwise read as black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return { source: canvas, scale, info: { url, width: bmp.width, height: bmp.height } };
  } catch {
    // Formats the browser can't decode itself (e.g. HEIC on some browsers): let Tesseract try.
    return { source: file, scale: 1, info: { url, width: 0, height: 0 } };
  }
}

/**
 * Read marks tables out of screenshots, on the device (Tesseract.js, loaded on demand).
 * Returns every text line in order, with word confidences and where it sits on its image.
 */
export async function readScreenshots(files: File[], onProgress: (p: ReadProgress) => void): Promise<{ lines: SourceLine[]; images: UploadedImage[] }> {
  onProgress({ label: 'Getting the reader ready…', value: 0 });
  const { createWorker, PSM } = await import('tesseract.js');
  let current = 0;
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress({
          label: files.length > 1 ? `Reading screenshot ${current + 1} of ${files.length}…` : 'Reading your screenshot…',
          value: (current + m.progress) / files.length,
        });
      } else if (/load|initializ/i.test(m.status)) {
        onProgress({ label: 'Getting the reader ready (only slow the first time)…', value: 0 });
      }
    },
  });
  // Single-block mode keeps each table row on one line; the default splits the columns apart.
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' });

  const lines: SourceLine[] = [];
  const images: UploadedImage[] = [];
  try {
    for (current = 0; current < files.length; current++) {
      const { source, scale, info } = await prepare(files[current]);
      images.push(info);
      const { data } = await worker.recognize(source, {}, { blocks: true, text: true });
      for (const b of data.blocks ?? [])
        for (const p of b.paragraphs)
          for (const l of p.lines) {
            lines.push({
              text: l.text,
              words: l.words.map((w) => ({
                text: w.text,
                confidence: w.confidence,
                bbox: { x0: w.bbox.x0 / scale, y0: w.bbox.y0 / scale, x1: w.bbox.x1 / scale, y1: w.bbox.y1 / scale },
              })),
              image: current,
              bbox: { x0: l.bbox.x0 / scale, y0: l.bbox.y0 / scale, x1: l.bbox.x1 / scale, y1: l.bbox.y1 / scale },
            });
          }
    }
  } finally {
    await worker.terminate();
  }
  onProgress({ label: 'Done', value: 1 });
  return { lines, images };
}
