# OCR plan for the management review

## Honest position

The current OCR is an experimental first draft, not an accurate automatic
transcription service. On the nine available real worksheet photographs:

- six are classified `retake_recommended`;
- three are `borderline_candidate`;
- five stop before any Braille cells can be grouped;
- four produce a draft, capped at 55% confidence;
- the latest measured ground-truthed pages range from 2% to 51% word accuracy;
- Grade 2 Liblouis translation is not available in the deployed runtime.

The engine must therefore remain behind specialist verification. A successful
MVP review should demonstrate the guarded workflow and the correction data it
captures, not claim that real-photo OCR is solved.

## Review format

1. Run the main walkthrough in deterministic demo mode. State clearly that the
   draft is simulated so the workflow can be reviewed consistently.
2. Show one pre-tested, non-pupil Braille-only capture in real OCR mode as an
   experimental quality demonstration. Expect specialist correction.
3. Show that a low-quality result is labelled as requiring a retake or a manual
   specialist transcription, and that teacher feedback/export remain locked.
4. Show the specialist correction, verification, teacher feedback, approval,
   audit record, and persisted record as the value of the MVP.

Do not use a hidden pre-written transcript as though it came from OCR. A
pre-verified record is acceptable only when introduced as a pre-verified demo
record.

## Work that can improve tomorrow's demonstration

- Re-capture a synthetic or approved Braille page on a plain background, flat
  and square to the camera, with mild directional side lighting.
- Crop tightly to Braille only; exclude handwriting, print, fabric, and page
  clutter.
- Rehearse the exact file offline and record its measured correction burden.
- Keep the deterministic demo available as the fallback for the meeting.

## Work that cannot honestly be completed overnight

- production-grade accuracy on arbitrary classroom photographs;
- calibrated confidence without a permissioned, human-transcribed dataset;
- a trained real-photo classifier without reviewed in-domain pages;
- certified Braille accuracy without specialist verification.

## Next development milestone

Collect at least 30 anonymised, approved, human-transcribed pages across the
expected capture conditions. Use those pages to train or fine-tune the dot and
cell classifier and evaluate with held-out CER/WER. Preserve the current
specialist-verification gate regardless of the resulting score.
