# Braille hybrid evaluation protocol

This protocol measures whether the hybrid review helps specialists find errors without
allowing the secondary model to become an unverified transcription engine.

## Safety invariants

- ABC Braille remains the source of the stored `draftText`.
- OpenAI returns discrepancy records only; suggestions are never applied automatically.
- Liblouis consumes detected Braille cells and never claims to read the image itself.
- Every output remains locked behind QTVI/Braille-literate specialist verification.
- Use synthetic, anonymised, or explicitly permission-cleared samples only.

## Evaluation set

Create a held-out set in **Quality** with an image and a specialist-verified ground truth
for every sample. Aim for at least 50 pages before interpreting percentages. Balance the
set across:

| Dimension | Required coverage |
| --- | --- |
| Braille grade | UEB Grade 1, UEB Grade 2, unknown/mixed |
| Content | prose, numbers, punctuation, capitals, contractions, subject terminology |
| Layout | single line, paragraphs, lists, multi-column or irregular line order |
| Capture quality | clean scan, phone photo, skew, uneven light, low contrast, partial blur |
| Difficulty | easy, medium, deliberately difficult |

Do not tune prompts against the held-out set. Keep a separate development set for prompt
changes and image-preprocessing experiments.

## Measures

The built-in Quality harness records character error rate (CER), word error rate (WER),
the number of OpenAI discrepancy findings, and ABC/Liblouis character agreement when
available. For each release, additionally record:

1. **Primary OCR CER/WER:** ABC draft against specialist ground truth.
2. **Review recall:** proportion of true ABC errors that an OpenAI finding correctly
   locates.
3. **Review precision:** proportion of OpenAI findings that correspond to a true error.
4. **False-correction rate:** suggestions that would make correct ABC text worse.
5. **Specialist correction time:** median time to verification with and without review
   evidence, using comparable samples.
6. **Failure coverage:** proportion of runs where ABC, Liblouis, or OpenAI is unavailable
   but the workflow still returns a controlled, reviewable state.

Report results by image quality and Braille grade, not only as one aggregate. A lower
overall CER can hide serious regressions on poor captures, numbers, or Grade 2
contractions.

## Release gate

Treat the hybrid review as beneficial only when its review recall improves specialist
error detection without an unacceptable false-correction rate. Define those thresholds
with the QTVI team before a pilot. A model or prompt change must not ship merely because
it reports more discrepancies.

Run the local contract checks with:

```bash
npm run validate:hybrid-braille
npm run typecheck
```

The contract check is offline and does not spend OpenAI credits. A funded live-provider
test must be an explicit, synthetic-image test and its result must still be reviewed by a
Braille-literate specialist.
