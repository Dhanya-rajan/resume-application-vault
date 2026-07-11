# Resume Application Vault

A private Next.js dashboard for storing job applications, recruiter notes, job descriptions, and tailored resume files in Firebase.

## Setup

1. Create a Firebase project.
2. Enable Email/Password sign-in in Firebase Authentication.
3. Create a Firestore database.
4. Create a Firebase Storage bucket.
5. Copy `.env.example` to `.env.local` and fill in the Firebase web app config.
6. Deploy `firestore.rules` and `storage.rules` in the Firebase console or Firebase CLI.
7. Run the app:

```bash
pnpm install
pnpm dev
```

## Deployment

Deploy the repository to Vercel and add the same `NEXT_PUBLIC_FIREBASE_*` values as Vercel environment variables.

Uploaded files are stored in Firebase Storage under your signed-in user id. After an upload succeeds in the dashboard, the local file in Downloads is no longer needed by the app.
