# AniSkolar Features

AniSkolar is the scholarship portal we built for DLSU-D's Admissions and Scholarship Office (AdSO). Students use it to find and apply for scholarships, and once they're scholars, to renew and log their duty hours. The AdSO, the POLCA and Alumni offices, and the heads of duty offices each have their own side of the system.

It currently handles the SFAG (Student Financial Aid Grant), Entrance, EBPSP, POLCA and Alumni scholarships, and the AdSO can add new ones.

The frontend is a React app made with Vite, and the backend is an Express API with MongoDB Atlas as the database. Students and staff sign in with their Microsoft school accounts through Clerk. Uploaded files are stored in Azure Blob Storage, emails are sent through Azure so they arrive in Outlook, and announcements can be posted to the office's Facebook Page.

Setup instructions and the rules behind each feature are in HANDOFF.md.


## For students

### Account and profile

Students sign in with their school Microsoft account and fill out their profile once. The student number has to be 9 digits, and the first 4 digits are the year they entered (1990 or later).

The profile has their personal details, program, year level, GPA and family background. Programs come from the official DLSU-D list of 38 programs, and the college is filled in from the program. Every field is required except the telephone number and the name suffix (Jr., Sr., II and so on). 1st years can leave the GPA blank. A parent can be marked as deceased, which skips their contact number.

Sign-up has no "skip for now". The last step shows everything for review and asks the student to confirm that the details are correct. After that, their name, birth details, nationality, civil status and program are locked. To change them, the student sends a change request, which goes to the AdSO's Messages, and the AdSO edits the profile from the Scholars page. Year level, section, GPA, contact and family details stay editable. When the office verifies a student's details, they're marked as verified, and the student can ask for a correction if something is wrong.

### Finding a scholarship

- Explore shows every scholarship and checks the student's GPA and year level against the requirements. If they don't qualify, it shows a warning instead of hiding the scholarship.
- Scholarships can be compared side by side, with the benefits, application period and handling office at the top.
- Each scholarship has a page with its benefits, requirements, process and deadline.
- The GPA calculator checks grades against each scholarship's GPA rule, and the result can be saved to the profile.
- Announcements from the office show up in a feed, including pinned posts and posts with images.

### Applying

SFAG, Entrance and EBPSP have online application forms. POLCA and Alumni have longer forms with several steps, and these save drafts automatically so students can finish them later.

Students upload their documents with a checklist of what's required. Each application gets a reference number like SFAG-2026-0001 and a timeline of its status. My Applications lists all of them with a status filter and the office's latest message. If the office asks for a revision, the student can fix it and resubmit.

Clicking a notification opens a short preview first (the status and the office's note), with a button to the application.

The system enforces a few of the office's rules:
- a student can only hold one internally funded scholarship at a time, the SFAG included. They can still apply for and be approved for several; if two are approved, they choose which one to keep
- new SFAG applications are only accepted in June and July
- POLCA takes 2 scholars per college and Alumni takes 2 for the whole campus

### After becoming a scholar

Once approved, Explore Grants in the sidebar is replaced by My Scholarship, and a Scholar badge shows which scholarship they hold. My Scholarship shows the grant percentage, approval date, reference number and what they need to keep it. If a student is approved for two scholarships, My Scholarship asks them to choose one. The other is marked "Declined by student", its slot opens, and the AdSO is told in Messages.

Scholars renew their scholarship every semester by submitting their grades only: their GPA, whether they had a failing grade, and a JPG of their Certified True Copy of Grades (TCG). SFAG scholars can renew only after their office head has evaluated last semester's duty. Until then the renewal says what it's waiting for, though they can still say they're not continuing. If they're not continuing because of OJT, graduation or something else, they say so on the same form.

SFAG scholars also have a Duty Hours page:
- They log each duty after rendering it. Duty is only allowed Monday to Thursday from 8 to 6 and Friday from 8 to 5, it can't overlap the 12 to 1 lunch break, each duty has to be at least 1.5 hours, and times are picked in 30-minute steps (8:00, 8:30 and so on). These rules are checked when they save.
- The deadline is set by the AdSO for the whole semester. Scholars see it but can't change it.
- Their required hours depend on their grant percentage and year level. The page shows how many hours they've done, how many are left, and how many they need per week to finish on time.
- Each duty shows whether their office head has confirmed it, is still checking it, or flagged it with a note.
- They can claim hours for events set by the scholarship office or COSA, and the AdSO approves the claim.

Students can also message the AdSO directly. They can attach JPG, PNG or PDF files and link the message to one of their applications, and they get an email when the office replies.


## For the AdSO

### Applications and scholars

The Applications page lists every application with tabs for each status, plus a search that also covers the scholarship name, and a college column. Opening one shows the form, the documents and the activity history. From there the AdSO can approve, reject or ask for a revision with a message to the student. On the SFAG form, students choose the grant they're applying for (100, 75, 50 or 25% tuition discount). When approving, the AdSO's grant field starts at that choice, and the AdSO can approve it as is or grant a different one. It can still be changed after approval. There are saved message templates for common replies. A document can be downloaded on its own, or all of them at once as a zip file.

The Scholars page lists everyone who has applied, with each person's full history. The AdSO can message a scholar, edit their profile (including locked details, when the student asks for a change), print, or download all of a scholar's files. Exporting to Excel opens a preview first, where the AdSO picks the columns and sees the first rows. The zip has a folder named after the student, for example "Reyes, Maria S-documents". When a scholar graduates or stops, the office records it, and that frees up the slot.

### Renewals

The AdSO opens a renewal period for each scholarship and semester and sets the deadline, minimum GPA, and whether an evaluation from the office head is needed. The only document is the scholar's grades, the same for every period. The list shows every scholar who holds the scholarship, including those who haven't submitted yet.

Each submitted renewal is checked automatically against the GPA, failing grades, documents, last semester's duty hours and the evaluation, and marked Eligible, Waiting, Needs review or Not eligible, with the reasons listed. The ones that pass everything can be renewed together with one button. The rest are still decided one at a time.

The page also shows where each scholar did their duty, can email the office heads to remind them to evaluate, and can export a CSV or a zip of all the renewal documents.

### Duty hours

This page shows every SFAG scholar for the semester along with their hours, status and pace. The AdSO assigns each scholar an office. This can be done one at a time, for several scholars at once, or randomly based on how many slots each office has. When assigning an office, the AdSO can search the office list and see how many slots are used and who the head is.

The AdSO also sets the duty deadline for each semester, keeps the list of offices with their slots and heads, sets the required hours for each year level and grant percentage, adds events that count for duty hours and approves claims for them, and handles requests from office heads.

### Statistics and reports

There's a statistics page that breaks applications down by status, scholarship, office and school year. There's also an FSE report page that produces the office's FSE workbook.

### Messages and announcements

Messages holds every conversation with students and with duty offices, with attachments, unread counts and email alerts. The AdSO can pin a conversation to the top, archive it (it comes back when the student or office writes again), mark it as unread, or delete it from their inbox. These only change the AdSO's own inbox: the student keeps their copy, and the "Seen" receipts don't change.

Announcements can be saved as drafts, scheduled, pinned, or posted with images. They're also posted to the office's Facebook Page, and the AdSO can choose to email them to students. The email looks like the office's usual announcements and shows the photos in the message. It can go to everyone or to a chosen group, such as applicants or scholars of certain scholarships, students from certain colleges or year levels, or specific students.

### Scholarships and automation

The AdSO can edit each scholarship's details, status and deadline, set which requirements apply using the requirements matrix, create new scholarships (with the description, benefits and application period students will see), and post an announcement when a scholarship opens or closes.

The Automation page has tasks the system can do on its own. Each one is off until the AdSO turns it on, and each can be previewed first to see who would get an email.
- Weekly reminders to SFAG scholars who are behind on duty hours
- Weekly reminders to office heads who have duties to confirm or scholars ready to evaluate
- Reminders before renewal and application deadlines, and to students who haven't fixed an application that needs revision
- A morning summary for the AdSO of what's waiting
- Assigning offices to scholars at the start of each semester, keeping them in the same office as last semester when there's room

Emails are sent a few at a time to stay within the email service's limits. If one fails, it's tried again later, and the ones that still fail are listed on this page.


## For the POLCA and Alumni offices

POLCA and Alumni review applications for their own scholarships. When they approve one, it's sent to the AdSO automatically, and the AdSO can still change the decision. Each office only sees its own applications, renewals and documents, and has its own message templates. The statistics page is for the AdSO only.

POLCA accepts 2 scholars per college and Alumni accepts 2 for the whole campus. Neither scholarship has renewals. When a scholar graduates or stops, recording it opens the slot for someone else.


## For duty office heads

Office heads sign in with the school email the AdSO has listed for their office. They don't need to register separately. The portal opens with three counts: duties to check, scholars ready to evaluate, and unread messages. It shows the scholars assigned to their office, grouped by semester, with each scholar's progress toward their required hours and every duty they logged. Heads confirm or flag each duty, or confirm all of them at once. Once an office has a head in the system, only confirmed duties count toward a scholar's hours.

A scholar can be evaluated once their hours for the semester are complete. At that moment the head gets an email, and the scholar moves to "Ready to evaluate" in the portal. The scholar is told too, by email, a notification and a note on their Duty Hours page, that their hours are done and their office head will evaluate them next. Heads fill out the 1 to 5 evaluation, which goes into the scholar's renewal for the next semester. They can ask the AdSO for a specific scholar or for more or fewer scholars, and message the AdSO directly.


## Other things worth knowing

- Each office can only see its own data. Uploaded files can only be opened by the student who owns them or by the office handling them, and the server always uses the signed-in account to identify the student.
- Messages containing explicit or offensive words, in English or Filipino, can't be sent. This includes words disguised with symbols, numbers or extra letters. The message box warns as you type, and the server rejects the message as well.
- Email alerts for new messages are sent first, ahead of reminders, and are retried if the email service is busy instead of being lost.
- The browser's back and forward buttons work on every page, pages show a loading preview while data loads, and the layout works on phones.


## Still to do

These depend on other people:
- moving to production: the system runs on Render and Vercel for testing, but real use needs Clerk production keys, a custom domain and a paid Render plan (the free one sleeps when idle)
- sending emails from the Scholarship Office's own address, which needs permission from DLSU-D IT
- accounts for COSA
- details for the Heraldo Filipino scholarship
- the complete 19-item evaluation form

These haven't been built yet:
- a screen for the AdSO to verify student profiles
- emailing students when a decision is made
- closing renewal and application periods automatically at the deadline
- the other ideas listed in HANDOFF.md
- a proper automated test suite, since testing so far was done with temporary scripts
