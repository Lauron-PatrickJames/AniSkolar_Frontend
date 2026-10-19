# AniSkolar — hand-off notes

_Last updated 2026-10-18._

Work branch: `claude/youthful-hawking-4wghiu` in both repos (frontend + backend).
Not merged into `main` yet. The repos moved to the Lauron-PatrickJames
GitHub account (Lauron-PatrickJames/AniSkolar_Frontend and
AniSkolar_Backend); update your `origin` with `git remote set-url` if you
cloned the old addresses.

## Where things stand
- Features are essentially complete: student portal (profile, Explore /
  Compare, applications for SFAG, Entrance, EBPSP, POLCA and Alumni,
  renewals, duty hours, messages), AdSO console (applications, renewals,
  scholars, duty hours with offices and events, statistics, FSE report,
  messages, announcements with Facebook and Outlook email, scholarships
  and the requirements matrix), POLCA / Alumni office consoles.
- Not done yet: deployment (see "Still needed"), an AdSO screen for
  verifying profiles and correction requests, and a saved automated test
  suite (changes were tested with throwaway scripts against a separate
  test database, `aniskolar_renewal_test`; those scripts aren't in the
  repos).
- Waiting on others: Heraldo Filipino details (AdSO), POLCA's rules,
  COSA accounts, DLSU-D IT for sending email as the Scholarship mailbox.

Contents: After pulling · Configuration · Demo data · Rules worth knowing ·
Renewals · Duty hours · Messages · Email (Outlook) · Profile · Scholarship
status announcements · Scholarship requirements · Office facts · File
storage · Programs list · FSE report · Still needed · Open ideas.

## After pulling
1. Backend: `npm install` (new since 2026-10-18: `@azure/communication-email`
   and `sharp`). `node_modules` is no longer in git (2026-10-17).
2. Frontend: `npm install` (SheetJS installs from `vendor/xlsx-0.20.3.tgz`).
3. Copy any new settings from the backend's `.env.example` into your own
   `.env` (see "Configuration"). Without the email settings everything
   works; emails are just skipped.
4. Restart the backend. It creates new collections on its own
   (`messages`, `dutyevents`); no migration is needed.
5. Optional, older: backfill student name parts from Clerk (backend):
   `node scripts/backfill-student-names.js` (dry run), then `--apply`.

## Configuration (backend `.env`)
`.env` is git-ignored — never commit it or paste its keys anywhere.
`.env.example` lists every setting with empty placeholders.

| Setting | What it does |
|---|---|
| `MONGODB_URI` | Atlas connection string (database `aniskolar`). |
| `MONGODB_DB` | Optional: another database, e.g. `aniskolar_demo` (see "Demo data"). |
| `PORT` | Backend port (default 5000). |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk (sign-in). |
| `FRONTEND_ORIGINS` | Allowed frontend origins (CORS), comma-separated. |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Blob Storage for uploaded files; empty = MongoDB GridFS. |
| `AZURE_STORAGE_CONTAINER` | `aniskolar-files` (real) or `aniskolar-demo` (demo). |
| `ACS_EMAIL_CONNECTION_STRING` | Azure Communication Services (`aniskolar-comms` → Keys); empty = no emails. |
| `ACS_EMAIL_SENDER` | The sender, `DoNotReply@…azurecomm.net` (later `noreply@aniskolar.com`). |
| `ADSO_NOTIFY_EMAIL` | Who is emailed when a student sends a message. |
| `EMAIL_REPLY_TO` | Optional: where replies to AniSkolar emails go (the AdSO's mailbox at handover). |
| `EMAIL_SIGNATURE` | Optional: signature lines separated by `\|`, e.g. `Name, MS\|Scholarship Associate`. |
| `APP_URL` | The frontend address used in email links. |
| `ANNOUNCEMENT_EMAIL_BATCHES_PER_MINUTE` | Announcement BCC batches of 50 per minute (1 while on the free sender). |
| `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN`, `FB_GRAPH_VERSION` | Facebook Page cross-posting (`services/facebook.js`). |

Azure (Azure for Students, resource group `aniskolar`):
`aniskolarfiles` (storage, Southeast Asia), `aniskolar-email` (Email
Communication Service with a free Azure-managed domain) connected to
`aniskolar-comms` (Communication Service), both Asia Pacific.

## Demo data
`node scripts/seed-demo.js` (backend) wipes and fills the **aniskolar_demo**
database (never the real one — the name must contain "demo") with sample
students, applications in every status (SFAG, Entrance, EBPSP, POLCA,
Alumni — POLCA and Alumni reviewed by their own offices, approved ones
forwarded to the AdSO; one student holding two internal scholarships),
an SFAG renewal period with renewals in every status (POLCA and Alumni
have none; CEAT's 2 POLCA slots are full, Alumni's 2 campus-wide slots are
full, and some older POLCA / Alumni scholars are marked Graduated), duty logs, offices, credited events
and claims, and announcements (published, pinned with an image,
scheduled, draft). Sample files go to the Azure container
`aniskolar-demo`. Sample students have `@aniskolar-demo.invalid` emails,
which `utils/mailer.js` never sends to. The real students' records are copied in, so your own
accounts work (each gets an approved SFAG with duty hours). To use it,
add `MONGODB_DB=aniskolar_demo` and `AZURE_STORAGE_CONTAINER=aniskolar-demo`
to the backend `.env` and restart; remove both to go back. The demo also has
messages (one waiting with a PDF) and six duty offices with slots set,
with a few scholars still without an office, for Random assign. If you test announcement emails on the demo, use
"Specific students" — your groupmates' real accounts are in it too.

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
- **Student numbers:** 9 digits; the first 4 are the year the student
  first enrolled at DLSU-D (1990 to next year), e.g. 202330864. Students
  from DLSU-D high school / senior high keep their number into college
  (e.g. a 2017 number in college), so the year says nothing about year
  level or freshman status — don't use it for eligibility. Checked in
  `CompleteProfilePage.tsx` and the backend's `routes/students.js`
  (`validStudentNumber`, which also rejects non-strings so the value is
  safe in a query).
- **POLCA: 2 scholars per college; Alumni: 2 scholars for the whole
  campus; neither has renewals** (Oct 2026; POLCA's rule to confirm with
  POLCA): `noRenewal` plus `slotsPerCollege: 2` on s3 and `totalSlots: 2`
  on s4, in both scholarship registries (`slotsFull` in
  `utils/collegeSlots.js` handles both). Alumni works like POLCA below,
  except the 2 slots are shared by all colleges. A POLCA scholar holds it from approval until
  POLCA (or the AdSO) marks them **Graduated** or **Stopped** on the
  approved application (review screen → "Scholarship status";
  `PATCH /api/applications/:id/end`, undoable), which frees the slot.
  When a college (from the student's program) already has 2 current
  scholars, its students can't apply (Explore shows why; the server
  answers 409 `college_slots_full`) and POLCA can't approve one (409,
  naming the current scholars). No renewal periods can be opened for
  POLCA or Alumni, and their admins don't see the Renewals page
  (AdminDashboard hides it for an office whose scholarships all have
  `noRenewal`), so Renewals is now the AdSO's alone. The
  Applications and Scholars lists show each student's college. `findHeldScholarships` counts noRenewal scholarships until they
  end, not just this AY or last (`utils/exclusivity.js`,
  `utils/collegeSlots.js`).
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
- Head evaluation (SFAG): the head of the office the scholar rendered
  duty in evaluates them (confirmed 2026-10-19). The Renewals list shows
  each scholar's **duty office** for the term being evaluated (the term
  before the period's, from Duty hours), and the evaluation's "Evaluating
  office" starts as that office (editable, e.g. if they moved). The head
  enters the 1–5 ratings in the office portal (or staff type them from a
  paper form); average below 4 = interview before deciding. Renewing is refused
  until it's entered when the period requires it. Ratings and remarks are
  never sent to scholars.
- Decisions follow the application rules (message required for Needs
  Revision, Not Renewed, and changing a decision; same status → 409).
- Documents are JPEG, stored in the same GridFS bucket as applications.

## Duty hours (student: Duty Hours; AdSO: Review → Duty hours)
- Replaces the office's "SFAG Duty Calculator" sheet. Only SFAG scholars
  have duty hours; they keep one log per term (1st / 2nd semester): the
  deadline, each duty (date, time in, time out) and claims for credited
  events. Required hours come from the AdSO's table (below) when the
  grant percentage and year level are known.
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
- Required hours follow the grant percentage and the year level: the AdSO
  records the percentage on the approved SFAG application (review screen →
  "Grant percentage"; `PATCH /api/applications/:id/sfag-percentage`); the
  year level comes from the scholar's profile. Hours per term (AdSO,
  Oct 2026; defaults in `models/DutySetting.js`, editable on the Duty hours
  page → "Hours per grant"):

  | Grant | 1st–2nd year | 3rd year and up |
  |------:|-------------:|----------------:|
  | 100%  | 180 | 95 |
  | 75%   | 135 | 70 |
  | 50%   | 100 | 55 |
  | 25%   | 50  | 30 |

  5th year counts with 3rd year and up. When the percentage, year level
  and hours are all set, those hours apply and the scholar can't change
  them; otherwise (e.g. no year level on the profile — the admin list says
  "year level not set") the scholar enters their own, as on the sheet. The
  deadline is still entered by the scholar.
- When duty may be logged (AdSO, Oct 2026; `dutyRuleError` in the
  backend's utils/dutyHours.js and src/utils/dutyHours.ts — keep in sync):
  Mon–Thu 8:00 AM–6:00 PM, Fri 8:00 AM–5:00 PM, no weekends, never across
  12:00–1:00 PM (log the morning and afternoon separately), at least 1.5
  hours per duty. Breaking one blocks saving with the reason.
- Credited events (Duty hours → "Events"; `models/DutyEvent.js`,
  `DutyLog.eventClaims`): events set up by the scholarship office or COSA
  (the scholars' org; it asks Ms. Nor first) that the office credits for
  duty. The credit is the office's call, not the event's length (a 1-hour
  event can be worth 3 hours). The AdSO adds each event (name, date,
  organizer, credit hours); scholars tap "I attended" on past events of
  the term → Pending; the AdSO approves or rejects (optional reason) and
  only approved claims count, at the event's current credit. Scholars can
  withdraw a pending claim. Scholars can no longer type their own event
  hours (`specialEvents` from old logs still count). An event with
  credited claims can't be deleted or moved to another term.
- Random assign (Duty hours → "Random assign"): the AdSO lists offices and
  how many scholars each takes (`officeSlots` in DutySetting, saved and
  reused every term; big offices — Registrar, Accounting, Admissions —
  are suggested 5, others 2). Scholars without an office are dealt into
  the free slots at random, one office at a time so they're spread out,
  with a preview before anything is saved ("Shuffle again" to redo).
  Office requests: asking for fewer scholars is fine; more depends on
  availability (few scholars, many offices) — the AdSO adjusts the slots.
  An office may also request a specific scholar: assign them to it first
  (Office column / "Assign office"), then Random assign deals out the rest
  and counts the requested ones toward the office's slots. That office's
  head later evaluates the scholar for renewal (see "Renewals").

## Office portal (duty office heads)
Paperless duty sign-off and evaluations (2026-10-19). The AdSO lists each
duty office's head in Duty hours → **Offices** (name + @dlsud.edu.ph
email; `DutySetting.officeSlots` also holds the Random-assign slots).
That person signs in to AniSkolar with that school email — no separate
account — and gets the **office portal** (`src/pages/office/OfficePortal.tsx`,
backend `routes/office.js`, `middleware/requireOfficeHead.js`,
`utils/offices.js`) instead of the student pages. An email listed as a
head wins even if it also has a student record (so the team can test with
their own accounts). One head per office.
- **Scholars & duties:** their SFAG scholars, all semesters on one page
  grouped by semester, newest first (`GET /api/office/scholars?all=1`; the
  Semester dropdown narrows it to one); each duty can be
  confirmed or flagged (with a note the scholar sees), one by one or
  "Confirm all waiting". Once an office has a head, **only confirmed duties
  count** (`summarize(…, { confirmationRequired })` in both
  `utils/dutyHours`); offices without a head count everything, as before.
  A scholar's save keeps confirmations (and ids) on duties whose date and
  times didn't change; an edited duty waits again.
- **Evaluations:** for open renewal periods that need one, the scholars who
  did duty in their office in the term the renewal looks back on; the head
  rates the 1–5 items online (`DutyLog.evaluation`, copied into the
  renewal — now or when the scholar submits; source `office`). Editable
  until the AdSO decides the renewal. Opening such a period emails the
  heads (one BCC email); Renewals → ⋯ → "Email office heads to evaluate"
  sends a reminder. The AdSO can still type a paper evaluation in.
- **Requests:** a specific scholar, more / fewer scholars, or other
  (`models/OfficeRequest.js`); the AdSO is emailed and answers in Duty
  hours → **Requests** (done / declined + reply the head sees).
- **Messages:** one conversation per office with the AdSO (`Message.office`);
  shows in the AdSO's Messages next to students (and "New message" → a
  duty office); emails both ways.
- Demo: three offices have sample heads (`.invalid` emails), duties before
  Oct 5 confirmed, one flagged, an open request and an office message. To
  see the portal yourself, put your own school email as a head in Duty
  hours → Offices (on the demo database) and sign in again.

## Messages (student ↔ AdSO)
- One conversation per student with the AdSO (`models/Message.js`,
  `routes/messages.js`). Students: sidebar → Messages (unread badge).
  AdSO: Communication → Messages (unread badge), plus "Message student"
  on an application and on a scholar; "New message" by student number.
  POLCA / Alumni admins don't have it (AdSO only, as decided).
- Text up to 4000 characters, up to 3 JPG/PNG/PDF attachments of 10 MB
  (checked by type and by their first bytes), stored like documents;
  `GET /api/messages/files/:fileId` lets only that student or the AdSO
  open them. A message can say which of the student's applications it's
  about. Read receipts ("Seen"); pages refresh every 20 s.

## Email (Outlook)
Sent through Azure Communication Services Email (`utils/mailer.js` — the
only file to change when switching providers). Students' and the AdSO's
@dlsud.edu.ph mailboxes are Outlook, so emails land there (Focused inbox
in testing). Addresses ending in `.invalid` (demo students) are never
emailed.
- Message alerts: the student's school email when the AdSO writes,
  `ADSO_NOTIFY_EMAIL` when a student writes; one email per burst while
  earlier messages are unread. Off (just logged) until the backend `.env`
  has `ACS_EMAIL_CONNECTION_STRING` and `ACS_EMAIL_SENDER`; also set
  `ADSO_NOTIFY_EMAIL` and `APP_URL` (see `.env.example`). Optional
  `EMAIL_REPLY_TO` makes replies go to that address. At handover the AdSO
  sets `ADSO_NOTIFY_EMAIL` and `EMAIL_REPLY_TO` to their own mailbox (the
  team doesn't have access to it); sending truly as an @dlsud.edu.ph
  address needs DLSU-D IT (HVE or Microsoft Graph).
- Announcements can also be emailed ("Also email students (Outlook)" in
  the editor and the scholarship open/close dialog;
  `utils/announcementEmails.js`). "Email to" (`EmailAudience.tsx`,
  backend `utils/emailTarget.js`, stored as `emailTarget`): all students,
  applicants (of any chosen scholarships, optionally by application
  status), current scholars (of chosen scholarships), or specific students
  (search or paste student numbers); every mode can be narrowed by college
  and year level. The editor shows "Will email N students" live
  (`POST /api/announcements/email/preview`). Older announcements with
  `emailAudience` still work. Sent once when published
  (scheduled ones at their time), BCC batches of 50,
  `ANNOUNCEMENT_EMAIL_BATCHES_PER_MINUTE` (default 2) per minute by the
  server's minute timer, resuming where it stopped; the list shows
  progress (sent/total), sent, or failed with Retry. Edits after sending
  aren't re-emailed. Without the email settings it shows failed: "Email
  isn't set up".
- Email look (`utils/emailTemplate.js`), modelled on the office's own
  Outlook announcements: images inline on top — the first one large
  (≤ 1200 px wide), the next 4 as a 2×2 grid of thumbnails, and "+N more
  photos" linking to AniSkolar, so many photos don't make it long; resized
  with `sharp` (e.g. a 7 MB photo becomes ~230 KB, 8 photos ~400 KB in all;
  the stored originals aren't changed), title, summary in bold, body with "-"/"•" lines as bullets
  and clickable links, a "View on AniSkolar" / "Reply in AniSkolar"
  button, optional signature (`EMAIL_SIGNATURE`, lines separated by "|")
  and the office footer (address, email, phone). Plain-text copy too.
- Limits: the free Azure-managed sender allows 5 emails a minute and 10
  an hour (each alert, and each announcement batch of up to 50, is one
  email). Fine for testing, not for emailing every student. Higher limits
  need a custom domain (aniskolar.com) plus a quota request to Azure.
- **Azure Communication Services Email retires on September 30, 2028**
  (maintenance mode; Microsoft advises against new workloads). It works
  until then.
- The office currently emails everyone from the Scholarship mailbox to
  Outlook distribution lists ("DLSU-D Students", "DLSU-D STAFF",
  "DLSU-D Faculty"). The ideal handover: DLSU-D IT lets AniSkolar send as
  that mailbox (Microsoft Graph) to "DLSU-D Students" — one email, no
  batches or Azure limits.
  The request for IT, made by or with the AdSO: "Can AniSkolar send as the
  Scholarship mailbox (Microsoft Graph) or through Microsoft 365 High
  Volume Email (HVE), to the DLSU-D Students list?" Until then:
  aniskolar.com as the sender, with `EMAIL_REPLY_TO` set to the AdSO.
- Set up on 2026-10-18 (Azure resources under "Configuration"). Seen in a
  real Outlook inbox: announcement emails (BCC, the new design). Checked
  in a preview only: the image layout. Covered by test scripts but not yet
  seen in a real inbox: message alerts.

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
- Frontend data: `src/data/programs.ts` (see "Programs list" below),
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
  specific scholar if it doesn't take one from another office. Hours by
  grant and year level: see "Duty hours" above. The assign dialog shows
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
- Done on 2026-10-17: Azure storage account `aniskolarfiles` (Southeast
  Asia, LRS, private). All 22 existing files copied and checked
  byte-for-byte, then deleted from MongoDB; new uploads land in Azure
  (25 files in total). The connection string is only in the backend's
  `.env` — never commit it. Document downloads send
  `Cache-Control: private, no-store`.
- Hosting plan: frontend on Vercel; backend on one always-on instance
  (Heroku Basic with GitHub Student credits — ticket pending; it has to stay
  on for the scheduled-post timer and the created-scholarships cache);
  MongoDB Atlas in Singapore; files on Azure (Azure for Students); domain
  aniskolar.com (to buy). Clerk's free plan is enough.

## Programs list and contact details (2026-10-17)
- `src/data/programs.ts` / backend `data/programs.js` (keep identical):
  38 undergraduate programs from dlsud.edu.ph/all-programs (Oct 2026),
  with names as the site writes them. Kept on purpose: the 5 Bachelor of
  Secondary Education majors (the site lists BSEd without majors) and BS
  Environmental and Sanitary Engineering (`BSEnSE`, CEAT), an SFAG
  priority course missing from the site. Multimedia Arts is under CEAT.
  Removed as discontinued: AB Philosophy, Elementary and Physical
  Education, BS Chemistry, BS Mathematics, BS Hospitality / Tourism
  Management, and the old BSBA majors. Codes are AniSkolar's own (the site
  has none). Existing students were all BSIT, so nobody was affected.
- AdSO contact as on dlsud.edu.ph/scholarship: scholarship@dlsud.edu.ph,
  AdSO_admissions@dlsud.edu.ph, Ayuntamiento de Gonzalez Bldg., Brgy.
  Fatima 1, Dasmariñas City, Cavite 4115, local 3029 (footer and
  `SCHOLARSHIP_OFFICE_PROVIDER`). The SFAG keeps local 3126 from its
  guidelines.
- The official scholarship page otherwise matches `scholarships.ts`. It
  still lists the Performing Arts Group (PAG) scholarship, which was
  removed because PAG declined to partner — to be decided with the group.
  KALINGA initiatives (Lasallian Spoon, One Dasma Dormitory, Alumni
  Legacy Night) are externally funded, so they stay out. The site's SFAG
  PDF is the older A.Y. 2025–26 version and gives no duty hours.

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

## Still needed
- From the AdSO: Heraldo Filipino details — still being coordinated.
  (EBPSP documents and SFAG duty hours confirmed 2026-10-18.)
- POLCA: confirm 2 scholars per college (by college, not program) and
  that there are no renewals. (Alumni's 2 campus-wide, no renewals:
  confirmed by the group, 2026-10-19.)
- COSA: whether COSA gets its own AniSkolar account to propose events
  (on hold — the group will talk to COSA). For now the AdSO enters COSA
  events.
- Group decisions: re-add PAG or not; whether the closing announcement
  starts unticked. (A "keep this one" button for a second internal
  scholarship was considered and dropped.)
- Email for real use: aniskolar.com as a custom sender domain in
  `aniskolar-email` and a quota increase, or (better) DLSU-D IT's
  permission to send as the Scholarship mailbox — see "Email (Outlook)".
- Deployment: buy aniskolar.com; Heroku student credits (support ticket
  open); then Procfile/engines, Vercel config, production env vars (every
  row in "Configuration", with `APP_URL` = the real address), Clerk
  production instance + DNS, Microsoft OAuth app, Facebook Page.
- Before going live: switch off the demo (`MONGODB_DB`,
  `AZURE_STORAGE_CONTAINER=aniskolar-files`), and set
  `ANNOUNCEMENT_EMAIL_BATCHES_PER_MINUTE` to what the sender allows.

## Open ideas (not done)
- Duty hours: let the AdSO set the deadline per term (required hours are
  already set per grant and year level); COSA accounts to propose events.
  (Head sign-off on duties and online evaluations: done — office portal.)
- AdSO screen to verify profiles and handle correction requests (the
  endpoints exist).
- Announcement email: the office's banner image in the footer, if the
  office provides the file.
- Renewal evaluation: the form has 19 items but our copy shows 15
  (`EVALUATION_ITEMS` in the backend's `utils/renewals.js` and the
  frontend's `src/utils/renewals.ts`); add the other 4 once the AdSO shares
  the form. The label for a rating of 1 is assumed ("Poor").
- Show the head's evaluation and remarks to scholars once Dr. May agrees.
- Let admins edit the message to the applicant without changing the
  decision, recorded as its own "Message updated" history entry.
- A server-side stats endpoint (`/api/applications/stats?from&to`) once
  the application count grows; the Statistics page computes in the
  browser today.
