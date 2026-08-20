# Stage 5 evidence, defensibility and bounded longitudinal records

Stage 5 organises evidence already persisted by the Braivanta workflow. It does not create an automated learner assessment, a standards certification, or a claim of educational effectiveness.

| Capability | Underlying persisted evidence | Authority | What Braivanta may state | Unsupported at Stage 5 |
| --- | --- | --- | --- | --- |
| Machine interpretation evidence | `Transcription.draftText` presence and run identity | System records availability | A machine draft and a Braivanta-owned transcription run were recorded | That the draft is accurate or that a provider identifier is a Braivanta run ID |
| Uncertainty and review burden | Persisted `reviewItems` and their review statuses | System records workflow events; specialist decides outcomes | Counts of flagged, reviewed, corrected, confirmed, re-scan, and unresolved items when recorded | Reviewer efficiency, time saved, or learner improvement |
| Transcription-run lineage | `transcriptionRunId` plus run-scoped correction evidence | System assigns run IDs; specialist records corrections | Current-run, previous-run, and legacy-unscoped evidence are distinct | That all historical runs are known when a run has no recorded correction |
| Specialist correction evidence | Append-only Stage 4 correction records | Braille-literate specialist | Recorded correction categories and reviewer evidence exist | A correction category identifies a learner weakness or fault |
| Specialist verification | `specialistVerifiedBy`, `specialistVerifiedAt`, verified final transcription | Qualified specialist | Specialist verification identity/time are recorded when present | That verification establishes full standards compliance |
| Teacher subject assessment | `TeacherSubjectAssessment` fields | Authorised teacher | The exact teacher-authored strengths, misconceptions, completeness, and reasoning are recorded | An automated educational conclusion beyond that assessment |
| Standards decision support | Stage 3 `standardsEvaluations` | System support plus specialist overrides | Count of recorded decision-support entries | Full UEB compliance, certification, or a new standards family |
| Provenance | Stage 3 availability fields | Provider/system record | Provenance is partial, unavailable, or not recorded | Source-image alignment, cell-to-English mapping, or correction-specific source mapping |
| Longitudinal evidence history | Verified Braille tasks for one learner | Existing specialist/teacher authority retained | A chronological record of verified submission evidence | Proficiency score, attainment band, predicted grade, progress percentage, risk score, or automated learning trajectory |

## Privacy and access boundary

The learner evidence route derives a narrow view from `BrailleTask` records and does not duplicate raw uploads, provider payloads, transcription text, correction text, reviewer reasons, API keys, or source mappings. It is guarded by the explicit `pupil.evidence.read` permission, granted to teacher, QTVI, SENCO, and admin roles; a teaching assistant does not obtain access through aggregation. The view preserves the existing source/provider restrictions by reporting only bounded availability and counts.

## Evidence wording

Use **recorded**, **not recorded**, **unavailable**, and **not applicable** as evidence states. Correction categories are descriptions of recorded specialist review actions, not statements about a learner. Review-burden fields are measurement-ready workflow evidence only; no time-saving or efficiency claim is established.

## Limits

- No proven source-image alignment or cell-to-English mapping.
- No correction-specific source mapping is fabricated from page-level evidence.
- Standards coverage remains bounded to existing Stage 3 decision support.
- No learner-proficiency, progress, grading, risk, diagnostic, or intervention inference.
- No real-world educational validation or proven reviewer-efficiency gain.
- Controlled tests establish software behaviour, not real-world deployment evidence.
