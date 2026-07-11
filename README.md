# Resume Application Vault

A private Next.js dashboard for tracking job applications, recruiter notes, pasted job descriptions, statuses, follow-up dates, and Google Drive resume links in Firebase Firestore.

## Setup

1. Create a Firebase project.
2. Enable Google sign-in in Firebase Authentication.
3. Create a Firestore database.
4. Copy `.env.example` to `.env.local` and fill in the Firebase web app config.
5. Deploy `firestore.rules` in the Firebase console or Firebase CLI.
6. Enable the Google Drive API in the same Google Cloud project.
7. Run the app:

```bash
pnpm install
pnpm dev
```

## Deployment

Deploy the repository to Vercel and add the same `NEXT_PUBLIC_FIREBASE_*` values as Vercel environment variables.

This version does not upload files, so it does not require Firebase Storage billing.

Resume files upload to the signed-in user's Google Drive using the `drive.file` OAuth scope. Firebase Storage is not required.
