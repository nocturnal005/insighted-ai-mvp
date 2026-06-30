# InsightEd AI — Codex Benchmark Review

**Reviewed:** 2026-06-30 · **Reviewer:** Codex (gpt-5.5), non-interactive, read-only
**Benchmark:** the InsightEd AI MVP product specification (5 modules, 12 screens, 10 data
entities, product rules, compliance requirements, and 3 success-criteria workflows).

This document records (1) the as-found benchmark of the codebase against the spec and
(2) the P0 fixes subsequently applied. See **§7** for what changed after the review.

---

## 1. Architecture & stack

Next.js 14 App Router (TypeScript/Tailwind) using React Server Components, Server Actions,
and client workflow components. State is an **in-memory singleton store**
(`src/lib/store.ts`); auth is a **demo cookie role-picker** (`src/lib/session.ts`,
`src/app/login/*`); RBAC is a local permission map (`src/lib/rbac.ts`); mock AI is cleanly
separated (`src/lib/braille-engine.ts`, `src/lib/feedback.ts`); exports are plain text plus
print/PDF browser views (`src/lib/export-content.ts`, `src/app/api/export/[id]/route.ts`,
`src/app/print/[id]/page.tsx`).

> **One-line verdict:** A well-structured MVP that nails the core Braille workflow and the
> headline compliance gate (assessment-safe export). The original gaps were in *enforcement*
> (unguarded edit actions, stubbed secure deletion) and the editor→approval data flow.

## 2. Module-by-module benchmark (as found)

| Module | Status | Evidence |
|---|---|---|
| 1 — Braille Work Review | ✅ Done | Full create→upload→transcribe→edit→verify→reject→archive→export in `src/app/(app)/braille/actions.ts`, `braille/[id]/review-workflow.tsx`; export gate in `src/lib/export-content.ts`. Minor: task uses `approved`, transcription uses `verified`. |
| 2 — Automated Feedback Report | 🟡 Partial | Generated post-verification in `createFeedback`; all required sections in export. UI only edits teacher comments + learner summary, not findings (`review-workflow.tsx`). |
| 3 — Assessment-Safe Visual | 🟡 Partial | All features present in `src/app/(app)/assessment/*`. Gaps: `updateVisual` had **no RBAC check**; approval doesn't persist unsaved editor edits/tier; redaction is text-replace until saved. |
| 4 — STEM Description | 🟡 Partial | Templates/styles/flags/export in `src/app/(app)/stem/*`. Gaps: classification is manual; no reject/archive; edit/restyle lacked RBAC. |
| 5 — Secure Staff Workflow | 🟡 Partial | Roles/RBAC/audit/dashboard/approvals/admin exist. Gaps: demo login only; no assignment workflow; secure deletion stubbed; retention not enforced. |

### Required screens

| Screen | Status | Evidence |
|---|---|---|
| Login | ✅ Done | `src/app/login/*` (demo picker, not secure auth) |
| Dashboard | 🟡 Partial | `dashboard/page.tsx`; stats cover all modules, recent-activity is Braille-only |
| Create Braille Review | ✅ Done | `braille/new/*` |
| Braille transcription review | ✅ Done | `braille/[id]/*` |
| Feedback report editor | 🟡 Partial | findings not editable (`review-workflow.tsx`) |
| Create visual description | ✅ Done | `assessment/new/*` |
| Assessment-safe editor | 🟡 Partial | real editor/gate; edit action lacked RBAC |
| STEM description workflow | 🟡 Partial | manual classification; no reject/archive |
| Approval queue | 🟡 Partial | `approvals/page.tsx`; visible to all logged-in users, not role-scoped |
| Pupil record page | 🟡 Partial | `pupils/[id]/page.tsx`; lists all linked work, not only approved |
| Audit log page | ✅ Done | `audit/page.tsx`; gated by `audit.read` |
| User & role management | ✅ Done | `admin/page.tsx`, `admin/actions.ts`; admin-only |

### Data entities

| Entity | Status | Evidence |
|---|---|---|
| User | ✅ Done | `types.ts`, seeded in `store.ts` |
| Organisation | 🟡 Partial | only `organisationId` strings + settings, no entity |
| PupilProfile | 🟡 Partial | implemented as `Pupil` |
| Task | 🟡 Partial | no generic `Task`; separate `BrailleTask`/`VisualDescriptionTask`/`StemTask` |
| Upload | ✅ Done | `Upload` + `createUpload` |
| Transcription | ✅ Done | `Transcription` |
| FeedbackReport | ✅ Done | `FeedbackReport` |
| VisualDescription | ✅ Done | `VisualDescriptionTask` |
| Approval | ❌ Missing | approval state embedded as status/approvedBy fields, no entity |
| AuditLog | ✅ Done | `AuditEntry` + `recordAudit` |

## 3. Product rules & compliance check (as found)

| Rule / Requirement | Status | Evidence / Risk |
|---|---|---|
| AI output always draft | ✅ | Draft labels/warnings across workflows |
| No AI output final without staff approval | ✅ | Export requires verified/approved status |
| Assessment-safe export requires approval | ✅ | `buildExport("visual")` blocks unless approved |
| Low-confidence outputs flagged | ✅ | `confidence` + `lowConfidenceRegions` shown |
| Staff can edit all generated text | 🟡 | transcription/description editable; feedback findings not |
| Every important action logged | 🟡 | most actions log; secure-delete had no action; some edits unguarded |
| Must not claim to replace QTVIs/teachers | ✅ | UI/README consistently say human-verified |
| Human-in-the-loop at critical points | ✅ | verify/approve gates before export |
| Role-based permissions | 🟡 | core gates exist; `updateVisual`/`updateStem`/`restyleStem` unguarded |
| Secure login | 🟡 | demo cookie only; no password/OIDC/MFA |
| Data retention settings | 🟡 | `retentionDays` editable but not enforced |
| Secure deletion option | ❌ | admin button stubbed, no server action |
| No pupil data for AI training | 🟡 | `trainOnData:false` flag set, not functionally enforced |
| Privacy & DPIA placeholders | ✅ | `privacy/page.tsx`, `dpia/page.tsx` |

## 4. Success-criteria demo workflows (as found)

| Workflow | Can complete? | Notes |
|---|---|---|
| 1. Braille → draft → verify → feedback → export → audit | ✅ Yes | Requires switching demo users manually; audit recorded throughout |
| 2. Assessment graph → flag → hint tier/edit → QTVI approve → export → audit | ✅ Yes | *Fixed (see §7): `approveVisual` now persists the reviewer's current text/tier — no separate Save needed.* |
| 3. STEM → edit → approve → pupil record | ✅ Yes | *Fixed (see §7): `approveStem` now persists the current editor text on approval.* "Saved to pupil record" is implicit via `pupilId`. |

## 5. Top gaps & risks (as found)

**P0 (blocking)**
- Secure deletion UI-only despite compliance claim — `admin/page.tsx`
- Mutation actions without RBAC — `updateVisual`, `updateStem`, `restyleStem`
- Demo login is not secure production auth — `session.ts`, `login/*`

**P1 (important)**
- No explicit `Organisation` / `Approval` entity
- Feedback findings not editable
- Visual/STEM approve can approve stale saved text, not the editor's current text
- Dashboard recent-activity is Braille-only — `data.ts`
- Pupil records list all linked work, not only approved

**P2 (nice-to-have)**
- STEM "classification" is manual selection, not automated
- Approval queue not role-filtered
- Retention stored but (was) not enforced
- `assignedTo` exists for Braille but no UI uses it

## 6. Recommendations (original, prioritised)

1. Add RBAC to `updateVisual`/`updateStem`/`restyleStem`; add a `description.edit` permission. ✅ *done — see §7*
2. Implement secure deletion as a real Server Action in `admin/actions.ts`. ✅ *done — see §7*
3. Make `approveVisual`/`approveStem` save-then-approve so the shown text/tier is approved. ✅ *done — see §7*
4. Add a first-class `Approval` entity in `types.ts`/`store.ts`.
5. Make feedback findings editable in `ReviewWorkflow`.
6. Filter pupil records to approved work, or relabel as "linked tasks" (`getPupilWork`).
7. Expand dashboard recent-activity beyond Braille (`getDashboardStats`).
8. Replace demo auth before pilot; keep `getCurrentUser()` as the boundary. 🟡 *boundary hardened — see §7*

---

## 7. P0 fixes applied (2026-06-30)

The three P0 items were addressed after the review. The project still typechecks
(`npm run typecheck`) and builds (`npm run build`) cleanly.

### P0-1 — RBAC on description edit actions
- Added a new `description.edit` permission to `src/lib/rbac.ts`, granted to Teaching
  Assistant, Teacher, QTVI, and Admin (not SENCO, matching `transcription.edit`).
- Enforced it server-side in `updateVisual` (`assessment/actions.ts`) and `updateStem` /
  `restyleStem` (`stem/actions.ts`) — each now throws `Not permitted to edit descriptions`
  for unauthorised roles.
- Gated the edit UI client-side: added `canEdit` to the `permissions` props in
  `assessment/[id]/page.tsx` and `stem/[id]/page.tsx`, and in the workflow components
  (`visual-workflow.tsx`, `stem-workflow.tsx`) the textarea is read-only, and the
  Save / Redact / hint-tier / style controls are hidden when `canEdit` is false. Defence is
  enforced at the action layer; the UI gating is UX polish on top.

### P0-2 — Real secure deletion
- Added `purgeExpiredUploads(actor, retentionDays)` to `src/lib/store.ts`: removes stored
  upload binaries older than the retention window, nulls each referencing task's `uploadId`
  across all modules, and writes a `data.delete` audit entry per file. Returns the count.
  This also makes the **retention setting functional** (previously stored but unenforced).
- Added the `secureDeleteExpiredMaterial` Server Action to `admin/actions.ts` (org-manager
  only), which calls the helper, records a `data.purge` summary audit entry, revalidates
  `/admin` and `/audit`, and redirects to `/admin?purged=N`.
- Replaced the stubbed admin button with a real `<form>` plus a confirmation banner showing
  how many files were removed and linking to the audit trail (`admin/page.tsx`).

### P0-3 — Auth boundary hardened
- `setSession` now sets `secure: true` on the session cookie in production
  (`src/lib/session.ts`).
- Marked `session.ts` prominently as the **single authentication boundary** and the swap
  point for a real provider (Supabase Auth / OIDC + MFA). Full production auth remains a
  pre-pilot requirement — it is out of scope for an in-memory MVP, but nothing else in the
  app depends on anything beyond `getCurrentUser()` returning a `User`.

### P1 — Save-then-approve (2026-06-30)
- `approveVisual` now accepts the reviewer's current `editedDescription` + `hintTier` and
  `approveStem` accepts the current `editedDescription`; both persist that on-screen state
  before flipping status to `approved` (`assessment/actions.ts`, `stem/actions.ts`). The
  approve buttons pass the live editor values (`visual-workflow.tsx`, `stem-workflow.tsx`).
  Workflows 2 and 3 now complete without a separate Save step — unsaved edits can no longer
  be silently discarded at approval.

### Remaining (recommended next, not yet done)
- **P1:** editable feedback findings; first-class `Approval`/`Organisation` entities;
  filter pupil records to approved work; multi-module dashboard activity.
- **P2:** role-filtered approval queue; surface `assignedTo` in the UI; automated STEM
  classification when real vision AI is connected.
