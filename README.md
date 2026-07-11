# Resume Application Vault

A private Next.js dashboard for tracking job applications, recruiter notes, pasted job descriptions, statuses, and follow-up dates in Firebase Firestore.

## Setup

1. Create a Firebase project.
2. Enable Email/Password sign-in in Firebase Authentication.
3. Create a Firestore database.
4. Copy `.env.example` to `.env.local` and fill in the Firebase web app config.
5. Deploy `firestore.rules` in the Firebase console or Firebase CLI.
6. Run the app:

```bash
pnpm install
pnpm dev
```

## Deployment

Deploy the repository to Vercel and add the same `NEXT_PUBLIC_FIREBASE_*` values as Vercel environment variables.

This version does not upload files, so it does not require Firebase Storage billing.
