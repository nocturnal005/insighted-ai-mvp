# Demo Resources

Local, non-committed test files used to demonstrate and validate InsightEd AI in **demo mode**.

> **Data safety warning**
>
> Demo resources must be synthetic, anonymised, or permission-cleared. Do not use identifiable pupil data or live assessment materials without school approval.

This folder holds the source files a presenter uploads while running the [demo test matrix](../docs/demo-test-matrix.md) and the [client demo script](../docs/client-demo-script.md). **The files themselves are never committed** — a `.gitignore` in this folder keeps only the structure (`.gitkeep`) and this README. Drop your own synthetic files into the subfolders locally.

## What each folder is for

| Folder | Use it for | Suggested file types |
| --- | --- | --- |
| `braille/` | Synthetic Braille pupil-work images for the Braille Work Review OCR demo. | `.png`, `.jpg` (a photographed/scanned Braille page). PDFs are stored but not rasterised for OCR in this build. |
| `visuals/` | Charts, diagrams, graphs, tables, or question images for the Assessment-Safe visual description demo. | `.png`, `.jpg` |
| `stem/` | Science diagrams, maths graphs, labelled diagrams, or experiment setups for the STEM description demo. | `.png`, `.jpg` |
| `quality/` | Held-out OCR evaluation images paired with a known correct ("ground-truth") transcription, used to measure CER/WER on the Quality page. | `.png`, `.jpg` plus the ground-truth text typed into the form |
| `exports/` | A place to save the plain-text exports produced during a walkthrough, so you can show the approved output alongside the source. | `.txt` (produced by the app) |

## How to use these files

1. Confirm the app runs in demo mode (`AI_MODE=mock`, `DEMO_MODE=true` — the defaults). Mock mode is deterministic and offline, so the drafts are stable for a rehearsed walkthrough.
2. Place a synthetic file in the relevant subfolder above.
3. In the app, create the matching task type and upload the file (see the [demo test matrix](../docs/demo-test-matrix.md) for the exact steps and expected results).
4. Accepted upload types and the size cap are controlled by `ALLOWED_UPLOAD_TYPES` and `MAX_UPLOAD_MB` (see the root `.env.example`). Oversized or unsupported files are rejected before any provider call.

## Producing safe synthetic files

- **Braille pages:** generate UEB Grade 1/2 text with a Braille tool or type known content and photograph a Braille embosser page you own the rights to. Never photograph a real pupil's work.
- **Visuals / STEM:** use openly-licensed or self-made charts, graphs, and diagrams. Avoid anything carrying a real pupil's name, candidate number, or an unreleased live exam paper.
- **Quality samples:** pair each image with the exact correct transcription so CER/WER is meaningful. Mark the sample's source and permission status in the Quality form (`synthetic`, `anonymised_only`, `approved_for_testing`, `not_approved`).

## If real (approved) resources are supplied locally

If a school supplies approved, permission-cleared materials for a private rehearsal:

- Place them in the relevant subfolder **on your machine only**.
- Do **not** commit them — the `.gitignore` here already prevents that; do not override it.
- Delete them after the rehearsal, and use the Admin → secure deletion control to purge any uploads that entered the demo store.
