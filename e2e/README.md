# End-to-end tests (Playwright)

Real Chromium, driven by code: each test opens the app, clicks around and
checks what's on screen. Every test runs twice, at desktop size and at
iPhone size.

```bash
npm run test:e2e          # run everything (starts the dev server if needed)
npm run test:e2e:ui       # Playwright's window: watch tests, step through, re-run
npm run test:e2e:report   # open the last run's report (screenshots of failures)
```

First time on a new computer: `npx playwright install chromium`.

## What's covered

- `public.spec.ts`: signed out. Landing page, the login button reaching
  "Sign in with Microsoft", and no sideways scrolling.
- `student.spec.ts`: signed in as an SFAG scholar. Dashboard greeting and
  duty card ("55 of 55 h" plus the extra), page titles match the sidebar,
  My Scholarship, Duty Hours, the logo going home, and the account menu
  opening under the profile photo. Every page is checked for sideways
  scrolling.

## Signed-in tests

Clerk signs in a real account in the **development** instance, using the
Clerk secret key, so no Microsoft login is involved. Everything the app asks
the backend is answered by `mockApi.ts` (a fictional scholar), so the
account's real records are never read or changed. Each test signs out when
it's done.

Copy `.env.e2e.example` to `.env.e2e` (git-ignored) and set
`E2E_STUDENT_EMAIL`. The secret key is read from `.env.e2e` or, if it's not
there, from `../AniSkolar_Backend/.env`. Without both, the signed-in tests
are skipped.

To test a different situation (no scholarship yet, renewal open, hours not
done), change the data in `mockApi.ts` or add a variant of it.
