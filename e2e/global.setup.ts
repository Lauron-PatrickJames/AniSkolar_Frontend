import { clerkSetup } from '@clerk/testing/playwright';

// Gets a Clerk testing token (lets the browser past Clerk's bot protection)
// when the secret key is available. Without it, only the signed-out tests
// run and the signed-in ones are skipped.
export default async function globalSetup() {
  if (!process.env.CLERK_SECRET_KEY) {
    console.log('[e2e] No CLERK_SECRET_KEY: signed-in tests will be skipped.');
    return;
  }
  await clerkSetup();
}
