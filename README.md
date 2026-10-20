# CU Grade Predictor

Predicts Chandigarh University grades, SGPA and CGPA from internal marks entered during the semester, and works out the minimum external score needed for a target grade.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # model tests (reproduces real SGPAs from past result sheets)
npm run build    # static site in dist/ — deploy anywhere (Vercel, Netlify, GitHub Pages)
```

- `src/lib/ocr.ts` + `src/lib/importer.ts`: the screenshot import. Tesseract.js reads CUIMS marks screenshots on the device (single-block mode keeps table rows together). The importer turns rows like "MST-1 Hybrid 20 15" into mark boxes and flags low-confidence or impossible numbers for the student to check. `importer.test.ts` uses real OCR output from a CUIMS screenshot.
- `src/lib/factory.ts`: the predefined templates. `TEMPLATES` holds the semester subject lists shown on first visit, and `INTERNAL_TEMPLATES` holds the mark boxes each subject starts with (MSTs, assignments, worksheets…) and what each part is worth. **Check those weights against CU's real scheme.** Edit them once here and every student gets the fix.
- `src/lib/grading.ts`: grade points, estimated relative-grading cutoffs, and the past results they were calibrated on
- `src/lib/internal.ts`: internal-mark totals from assessment heads and their entries
- `src/lib/predict.ts`: Monte Carlo grade/SGPA odds, the MST + end-sem planner (`planAims`: picks a grade per subject so the SGPA/CGPA goal is met while keeping the highest score any subject needs as low as possible), and CGPA maths
- `src/lib/internal.ts`: internal marks from what's actually entered. Only the MST count (2) is assumed; everything else changes per semester
- Data is saved to `localStorage` on every change; the ⋯ menu exports and imports JSON backups.

To recalibrate, add rows to `CALIBRATION` in `grading.ts` and adjust `BASE_CUTOFFS`. The tests show how many real grades the cutoffs reproduce.
