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
  in June for the coming year (Entrance June 1–20; SFAG June 16 – July 3, 2026), so a cycle runs June–May
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
- **Name:** the scholarship is the "Student Financial Aid Grant (SFAG)"
  — "SFAG" for short, never "SFA Grant". Reference numbers use `SFAG-`
  (e.g. `SFAG-2026-0001`).
- **Scholar-only pages:** Renewal is only for scholars — a student with at
  least one approved application (`requireScholar`). Duty Hours is only
  for SFAG scholars — approved for or renewed on the SFAG at some point
  (`requireSfagScholar`; frontend `isSfagScholar`). Others don't see them
  in the sidebar or dashboard, are sent to the dashboard if they land on
  one, and the API answers 403 (both in the backend's
  `middleware/requireStudent.js`).
- **Who can read what (applications):** the applicant is always the
  signed-in student — a `studentNumber` sent by the browser is ignored
  (POST /api/applications) or never trusted (resubmit: owner only).
  Listing and opening applications, and reading stored files
  (`/api/applications/documents/:fileId`, also used by renewals): the
  owner, or an admin whose office can see the application / renewal
  (`requireStudentOrAdmin`). Everyone else gets 404 (403 for another
  student's list). Files need the session token, so the browser fetches
  them and shows a blob URL (`src/utils/documents.ts`: `useDocumentUrl`,
  `openDocument`) — never link to the file route directly.
- **GPA:** 0.00–4.00, higher is better, 0.00 = failed — everywhere
  (profile, forms, calculator, renewals). A scholarship's GPA rule lives in
  `gpaRequirement` (`src/data/scholarships.ts`, checked in
  `src/utils/eligibility.ts`): the GPA calculator shows each one against
  the grades entered and can save the result as the profile GPA; Explore
  warns (doesn't hide) when the profile GPA is below a minimum. The AdSO's
  ticked "Minimum GPA" / "No failing grades" rules feed it (see below).
- **SFAG application window:** new SFAG applications only in June and
  July (Manila time), before the 1st semester enrollment; the rest of the
  year is for renewals only. Outside June–July the server refuses SFAG
  applications and won't let the AdSO open the SFAG (or reset it to its
  default, Open); students see "Not available" with the reason
  (`inSfagApplicationWindow` in the backend's `utils/academicYear.js` and
  in `src/utils/eligibility.ts`). Within June–July the Open / Closed
  status decides, so the AdSO still opens and closes the exact dates.
- **One internally funded scholarship at a time** (AdSO interview, Oct
  2026): every scholarship in AniSkolar is internally funded. Students may
  apply for several; if two are approved, the student chooses which to
  keep (usually the bigger grant) and only that one is credited.
  Applying is never blocked. Approving one for a student who already
  holds another returns 409 `holds_other_scholarship` until the AdSO
  confirms ("Approve anyway" → `acknowledgeOtherScholarship`); the student
  then sees "choose which to keep" in Explore (`holdingNotice` /
  `needsToChoose` in src/utils/eligibility.ts, backend
  `utils/exclusivity.js`). "Holds" = approved or renewed this AY or last,
  unless the latest renewal is Not Renewed / Not Continuing. SFAG 25%
  grantees may also hold one internal scholarship of up to ₱10,000 — the
  office handles that by hand. Externally funded grants (DOST, CHED…)
  aren't in AniSkolar and have no limit.
- **Reference numbers:** `<CODE>-<AY start year>-<SEQ>`, e.g.
  `ENT-2026-0001`, `SFAG-2026-0001`, from `utils/referenceCode.js` only. Old references
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
- Head evaluation (SFAG): staff enter the 1–5 ratings from the head's
  form; average below 4 = interview before deciding. Renewing is refused
  until it's entered when the period requires it. Ratings and remarks are
  never sent to scholars.
- Decisions follow the application rules (message required for Needs
  Revision, Not Renewed, and changing a decision; same status → 409).
- Documents are JPEG, stored in the same GridFS bucket as applications.

## Duty hours (student: Duty Hours; AdSO: Review → Duty hours)
- Replaces the office's "SFAG Duty Calculator" sheet. Only SFAG scholars
  have duty hours; they keep one log per term (1st / 2nd semester):
  deadline and required hours, each duty (date, time in, time out) and
  special events with equivalent hours.
- The AdSO assigns the office each scholar renders duty in, per term:
  the Office column ("Assign office" / click to change), "Change" in a
  scholar's log, or select several and "Assign office"
  (`PUT /api/duty-hours/admin/office`). Assigning creates the scholar's log
  for the term if they have none. Scholars see the office read-only; the
  server ignores an office sent with their own saves. Who assigned it
  (`officeAssignedBy`) is kept for the AdSO only. Offices typed before are
  suggested (no fixed office list yet). Offices scholars typed themselves
  before this change are kept and can be overwritten. Day, hours per duty,
  totals, hours remaining, weekly hours needed and Sunday–Saturday weekly
  totals are computed (`utils/dutyHours.js` on the server,
  `src/utils/dutyHours.ts` in the browser — keep them in sync). Print
  report like the old calculator.
- Terms: August–December = 1st semester of that AY; January–July = 2nd
  semester of the AY before (midyear isn't tracked).
- The AdSO list shows every SFAG holder for the term
  (`findCurrentHolders`: approved application in that AY, or renewed into
  that term) plus any other SFAG scholar who logged hours; status Not started /
  In progress / Overdue (deadline passed) / Completed; CSV export.
- Required hours follow the grant percentage: the AdSO records it on the
  approved SFAG application (review screen → "Grant percentage";
  `PATCH /api/applications/:id/sfag-percentage`) and sets hours per
  percentage on the Duty hours page ("Hours per grant";
  `models/DutySetting.js`). When both are set, those hours apply and the
  scholar can't change them; otherwise the scholar enters their own, as on
  the sheet. Only 25% = 36 hours is filled in (as the team recalls it — to
  confirm); 100 / 75 / 50% are empty until the AdSO enters them. The
  deadline is still entered by the scholar.

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

## Scholarship status announcements + scheduled posts (2026-10-06)
- Opening, closing or marking a scholarship "Closing Soon" (Scholarships
  list menu, or saving a status change on the edit page) opens
  `ScholarshipStatusDialog`: an announcement drafted from the scholarship
  (`announcementFor`: title, summary, body with the deadline and how to
  apply; related scholarship set), editable, published with the change or
  scheduled, optionally cross-posted to Facebook. "Post an announcement"
  can be unticked. If the status saves but the post fails, the dialog
  stays open to retry (Skip keeps the status change).
- Announcements have a third status, `scheduled`, with `scheduledFor`
  (future, within a year). The editor's "Publish: Now / Schedule" sets it;
  a Scheduled tab lists them; editing can move the time, "Publish now",
  or "Unschedule to draft". A published post can't be scheduled (409).
- `publishDueAnnouncements` (routes/announcements.js) publishes due posts
  (publishedAt = the scheduled time) and syncs Facebook. It runs on server
  start, every minute (server.js) and before serving the student feed;
  each post is claimed atomically so it's never published twice.

## Scholarship requirements: checklists, matrix, new scholarships (2026-10-06)
- Shared catalog of eligibility rules and documents:
  `src/data/requirementCatalog.ts` (wording) and the backend's
  `data/requirementCatalog.js` (keys, validation) — keep in sync. Each
  scholarship stores `rules` (who can apply, minimum GPA, no failing
  grades, HS average, unit load, residency, Filipino, no balance),
  `customEligibility` (extra lines, not checked), `documentKeys` and
  `customDocuments`. The `eligibility` / `requirements` text students read
  is generated from them (`deriveScholarship`, data/scholarships.ts), and
  for the standard and SFAG forms `requirements` are the upload slots.
- Checked against the profile (warning only): who can apply (as before,
  freshman-only grants are hidden from upperclassmen) and the GPA rules
  (via `gpaRequirement`). The rest is shown, not checked.
- POLCA / Alumni: documents come from their fixed upload slots and the
  rules their forms check (`lockedRules`) can't be changed (UI + 400).
- Admin → Scholarships: the editor uses checklists and list rows (no more
  one-per-line text); "Requirements" view = the matrix: every scholarship
  side by side, each cell edits and saves immediately; Export CSV.
- New scholarships (AdSO): POST /api/scholarships {name, office, category,
  applicationMode, referenceCode}; stored as ScholarshipSetting with
  `custom: true`, start Closed, use the standard form (or info only).
  Backend keeps them in memory (`utils/customScholarships.js`, loaded at
  startup and after every change) so `findScholarship` finds them; the
  frontend adds them to the registry (`registerCustomScholarships`).
  DELETE only while they have no applications.
- Students: Explore Grants → "Compare" (`src/components/CompareTable.tsx`):
  pick up to 4 scholarships; shows who can apply with "You meet this" /
  "Your GPA is …" from the profile, other conditions, and documents;
  "Only show what's different" hides identical rows.
- A printable PDF of the matrix is in `docs/Scholarship-Requirements-Matrix.pdf`
  (generated from the code defaults + saved AdSO edits on 2026-10-06;
  regenerate after the AdSO changes requirements).

## Office facts (AdSO interview, Oct 2026)
- Admissions and Scholarship Office (AdSO) since SY 2026–27, under the
  Office of the Vice President for Student Experience (was the Linkages
  and Scholarship Office under OVGEER). Same purpose, venue and hours.
  Two units: Admissions and Testing; Recruitment and Scholarship.
- The Scholarship Associate is the only AniSkolar admin user. Evaluation
  order for 2026–27: Scholarship Associate → Ms. Jacqueline Torres (unit
  head) → Ms. Nornerlyn Cachuela (director) — done outside the system.
- The AdSO itself handles SFAG, Entrance, Academic and EBPSP; other
  offices (POLCA, Alumni, SDO, Vicissitude, ROTC, USG) run their own.
  Sponsored scholarships must be submitted before the end of the midterm
  period so they're credited to the student's account.
- Incoming freshmen get a DLSU-D portal account on reservation, so they
  sign in with it like everyone else.
- Announcements: Facebook, email and Schoolbook. The AdSO posts openings
  and closings themselves (the status dialog's announcement is optional).
- Duty: offices are assigned by need — usually 1–2 scholars, more for the
  Registrar, Accounting and Admissions (up to ~10). Offices may request a
  specific scholar if it doesn't take one from another office. 100% =
  180 hours (default in `models/DutySetting.js`). The assign dialog shows
  how many scholars each office already has.
- Scholarship list (Oct 2026): PAG declined to partner (removed, was s9);
  EBPSP = Enhanced Brother President Scholarship Program; USG Student
  Financial Aid Grant added as info only (s11, applied for through the
  USG's own form). Heraldo Filipino is listed but has no details yet —
  add it from Scholarships → New scholarship once it does. PD 577, UTFI,
  Kundirana, NBCMSEF and CCTI are awarded without application and aren't
  in AniSkolar (they still appear in the FSE report from the registrar).

## File storage (2026-10-17)
- Uploaded files (application/renewal documents, announcement images) go to
  Azure Blob Storage when the backend has `AZURE_STORAGE_CONNECTION_STRING`
  (private container, default `aniskolar-files`); otherwise MongoDB GridFS.
  Same ObjectIds either way, so records don't change; reads fall back to
  GridFS for files not moved yet (`utils/gridfs.js`: putFile / openFile /
  readFile / deleteFile). Move existing files with
  `scripts/move-files-to-azure.js` (dry run → `--apply` →
  `--delete-from-mongodb`). See the backend README "File storage".
- Hosting plan: frontend on Vercel; backend on one always-on instance
  (Heroku Basic with GitHub Student credits — ticket pending; it has to stay
  on for the scheduled-post timer and the created-scholarships cache);
  MongoDB Atlas in Singapore; files on Azure (Azure for Students); domain
  aniskolar.com (to buy). Clerk's free plan is enough.

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
