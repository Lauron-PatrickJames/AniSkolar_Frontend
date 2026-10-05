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
- **Browser Back / Forward:** every student page is a history entry
  (App.tsx), and so is every admin section / open application / scholar /
  scholarship (AdminDashboard.tsx, entries under `admin`). Redirects
  replace the entry instead of adding one. In-page "Back to …" buttons and
  the admin breadcrumb step back in history when that's where the page was
  opened from. Going back/forward onto an application form already sent,
  or a resubmission, shows the scholarship's details instead. The Renewal
  form is its own entry, so Back closes it. Queue Prev / Next replaces.
- **Scholar-only pages:** Renewal and Duty Hours are only for scholars —
  a student with at least one approved application. Non-scholars don't
  see them in the sidebar or dashboard, are sent to the dashboard if they
  land on one, and the API answers 403 (`requireScholar` in the backend's
  `middleware/requireStudent.js`).
- **GPA:** 0.00–4.00, higher is better, 0.00 = failed — everywhere
  (profile, forms, calculator, renewals). A scholarship's GPA rule lives in
  `gpaRequirement` (`src/data/scholarships.ts`, checked in
  `src/utils/eligibility.ts`): the GPA calculator shows each one against
  the grades entered and can save the result as the profile GPA; Explore
  warns (doesn't hide) when the profile GPA is below a minimum. AdSO edits
  to eligibility text don't change these rules.
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

## Renewals (admin: Review → Renewals; student: Renewal)
- The AdSO opens a renewal period per scholarship + term (1st / 2nd
  semester): deadline, minimum GPA (0.00–4.00, higher is better), documents
  to upload, and whether the department head's evaluation is required.
  Closing a period stops new submissions; scholars asked to revise can
  still resubmit. Office admins see their own scholarships' periods but
  can't open or edit them.
- Who can renew (`findHolders` in the backend's `utils/renewals.js`): an
  Approved application in the academic year being continued (same AY for
  2nd sem, previous AY for 1st sem), or Renewed in the previous term;
  Not Renewed / Not Continuing last term drops them.
- Scholars submit GPA, failing grade yes/no and the documents, or say
  they're not continuing (OJT, graduating, …). The admin list shows every
  holder, including those who haven't submitted.
- Head evaluation (SFA Grant): staff enter the 1–5 ratings from the head's
  form; average below 4 = interview before deciding. Renewing is refused
  until it's entered when the period requires it. Ratings and remarks are
  never sent to scholars.
- Decisions follow the application rules (message required for Needs
  Revision, Not Renewed, and changing a decision; same status → 409).
- Documents are JPEG, stored in the same GridFS bucket as applications.

## Duty hours (student: Duty Hours; AdSO: Review → Duty hours)
- Replaces the office's "SFAG Duty Calculator" sheet. Scholars with an
  approved scholarship keep one log per term (1st / 2nd semester): office
  assigned, deadline and required hours, each duty (date, time in, time
  out) and special events with equivalent hours. Day, hours per duty,
  totals, hours remaining, weekly hours needed and Sunday–Saturday weekly
  totals are computed (`utils/dutyHours.js` on the server,
  `src/utils/dutyHours.ts` in the browser — keep them in sync). Print
  report like the old calculator.
- Terms: August–December = 1st semester of that AY; January–July = 2nd
  semester of the AY before (midyear isn't tracked).
- The AdSO list shows every SFA Grant holder for the term
  (`findCurrentHolders`: approved application in that AY, or renewed into
  that term) plus anyone else who logged hours; status Not started /
  In progress / Overdue (deadline passed) / Completed; CSV export.
- Required hours and deadline are entered by the scholar, as on the sheet.

## Profile redesign + data consistency (done 2026-10-05)
- Server stamps first/middle/last name from the Student record on every
  application submit/resubmit (`stampStudentNames`, routes/applications.js).
- `scripts/fix-application-names.js` (backend): dry run shows 2 fixes
  (DLSU-D-ENTRANCE-735161 split name, DLSUD-AA-427193 middle name "w").
  Not applied yet — run with `--apply` when agreed.
- Admin review shows "As submitted <date>" and "Profile now: …" when the
  profile differs (`currentProfile` added to GET /api/applications).
- Student model: `verification.{program,enrollment,gpa}`,
  `correctionRequests`, `fatherContactNo`, `motherContactNo`,
  `guardianType`, `guardianAddressSameAsHome`. PATCH /api/students/me now
  validates program (from data/programs.js, sets course/college), year
  level, GPA (2 dp), PH mobile (stored 09XXXXXXXXX), 4-digit ZIP, guardian
  links, and refuses edits to verified groups (409).
  New: POST /api/students/me/correction-requests {group, message};
  PATCH /api/students/:studentNumber/verification {group, verified} (AdSO).
- Frontend data: `src/data/programs.ts` (TO CONFIRM with Registrar),
  `src/data/phLocations.ts` (PSGC provinces → cities).
- Helpers: `src/utils/profile.ts`, `displayName`/`titleCaseName` in
  `src/utils/names.ts`; AdminUI gained `Combobox`, `DatePicker`,
  `Modal sheet`.
- First-time setup (`CompleteProfilePage.tsx`) redesigned (2026-10-05):
  3 steps (Your studies — required; About you; Parents and guardian —
  skippable), account card, inline errors on blur, focus to first error,
  draft kept in sessionStorage. Its form pieces are shared:
  `src/components/profile/profileForm.ts` (draft type, validation,
  payload) and `ProfileFormSections.tsx` (Academic / Personal / Contact /
  Family fields; `AcademicFields` takes `locked` for verified groups).
- Profile page (`src/pages/student/Profile.tsx`): header card, Academic /
  Personal / Contact / Parents & guardian lists with Self-reported /
  Verified / Correction requested tags, "Not provided · Add" (opens the
  dialog on that field). Edit dialog
  (`src/components/profile/EditProfileDialog.tsx`): side tabs, one Save
  (only enabled when something changed; verified groups aren't sent),
  discard warning, error dots, Request correction. Top bar shows the
  title-case name. `handleUpdateProfile` (App.tsx) sends only changes and
  returns `{ ok, error }`.
Follow-ups:
- AdSO screen to verify academic details and work through correction
  requests (the endpoints exist; no admin UI yet).
- Confirm `programs.ts` / `programs.js` with the Registrar; confirm the
  9-digit student number rule.
- Run `scripts/fix-application-names.js --apply` when agreed.

## Open ideas (not done)
- Duty hours: let the AdSO set required hours and deadline per term
  instead of each scholar typing them; head sign-off on logged hours
  (needs department head accounts).
- Renewal evaluation: the form has 19 items but our copy shows 15
  (`EVALUATION_ITEMS` in the backend's `utils/renewals.js` and the
  frontend's `src/utils/renewals.ts`); add the other 4 once the AdSO shares
  the form. The label for a rating of 1 is assumed ("Poor").
- Show the head's evaluation and remarks to scholars once Dr. May agrees.
- School administrators (department heads) entering evaluations
  themselves needs a new account role.
- Let admins edit the message to the applicant without changing the
  decision, recorded as its own "Message updated" history entry.
- A server-side stats endpoint (`/api/applications/stats?from&to`) once
  the application count grows; the Statistics page computes in the
  browser today.

## FSE report (AdSO → Insights → FSE report)
- Upload the registrar's scholarship report per term (.xls/.xlsx), choose
  the academic year and term, enter the student population, and review
  each scholarship: include/leave out, and set a category (the report has
  none). Two layouts are read (`parseRegistrarWorkbook`, fse.ts):
  - the registrar's report (checked against a real one, Oct 2026): ID,
    NAME OF STUDENT, PROG, UNITS, fee columns, TOTAL ASSESSMENT (=
    matriculation), TOTAL DISC. Its header is one column left of the data;
    it runs several pages, each ending in a GRAND TOTAL (the review groups
    scholarships by page with "Set all to"). GRAND TOTALs don't reconcile
    and are ignored; each block is checked against its SUB TOTAL and a
    mismatch is warned (the sample file was missing ~29 DOST rows, code
    1725). FSE above 1.00 (discount > assessment, e.g. DOST's fixed 65,000)
    is warned, not capped — confirm the rule with the AdSO.
  - the FSE template's "Raw" sheet (Matriculation / Discount / Total
    Discount, fund source and subcategory beside CODE:).
- FSE per scholar = Total Discount / Matriculation; FSE % and headcount %
  are out of the population. Summary rows: Internal academic,
  Internal non-academic, Mainstream, Externally funded, Special programs,
  Institutional (all four).
- Special programs need a funding source (internal / external / co-funded);
  institutional FSE includes special programs.
- Repeated code blocks are merged and exact duplicate rows dropped.
- Saved per academic year + term (`/api/fse`, AdSO only); saving the same
  term again replaces it.
- Export (⋯ → Export academic year to Excel) writes one "FSE" sheet laid out
  like the AdSO FSE workbook: 1st/2nd semester rows 12–13, FIRST SEM / SECOND
  SEM blocks, head count computation and SPOON recipients, as live formulas.
  Midyear is not in the sheet.
- The browser reads the file with SheetJS 0.20.3, installed from the
  tarball in `vendor/xlsx-0.20.3.tgz` (the npm registry only has 0.18.5,
  which has known advisories). Keep the tarball committed; `npm install`
  needs it.
