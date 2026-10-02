# AniSkolar — hand-off notes

Work branch: `claude/youthful-hawking-4wghiu` in both repos (frontend + backend).
Not merged into `main` yet.

## After pulling
1. Restart the backend (new models: `Counter`, name parts on `Student`,
   `internalNotes` on `Application`).
2. Backfill student name parts from Clerk (backend folder):
   - `node scripts/backfill-student-names.js` — dry run, prints what it
     would change and lists applications whose stored first/last split
     differs (for manual review; applications are never rewritten).
   - `node scripts/backfill-student-names.js --apply` — writes the
     Student records.

## Rules worth knowing
- **Scholarship cycle:** classes start in August, but applications open
  June 1–20 for the coming year, so a cycle runs June–May
  (`CYCLE_START_MONTH` in `src/pages/admin/adminData.ts`, mirrored in the
  backend's `utils/academicYear.js`). "Returning" = applied in 2+ cycles.
- **Reference numbers:** `<CODE>-<AY start year>-<SEQ>`, e.g.
  `ENT-2026-0001`, from `utils/referenceCode.js` only. Old references
  are kept as they are.
- **Decisions (PATCH /api/applications/:id/status):**
  - a message to the applicant is required for Needs Revision, Rejected,
    and for changing an existing decision;
  - re-sending the current status is refused (409) — that was the old
    "Save note" path that recorded duplicate history entries;
  - staff-only notes use `POST /api/applications/:id/internal-notes` and
    are never sent to students.

## Open ideas (not done)
- Let admins edit the message to the applicant without changing the
  decision, recorded as its own "Message updated" history entry.
- A server-side stats endpoint (`/api/applications/stats?from&to`) once
  the application count grows; the Statistics page computes in the
  browser today.
