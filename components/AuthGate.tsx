"use client";

import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";
import { BriefcaseBusiness, LockKeyhole } from "lucide-react";
import { ApplicationDashboard } from "@/components/ApplicationDashboard";
import { auth, hasFirebaseConfig } from "@/lib/firebase";

const driveScope = "https://www.googleapis.com/auth/drive.file";

export function AuthGate() {
  const [user, setUser] = useState<User | null>(null);
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!auth) {
      setChecking(false);
      return;
    }

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setChecking(false);
    });
  }, []);

  async function signInWithGoogle() {
    if (!auth) {
      setError("Firebase is not configured yet.");
      return;
    }

    setError("");

    try {
      const provider = new GoogleAuthProvider();
      provider.addScope(driveScope);
      provider.setCustomParameters({
        prompt: "consent"
      });

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      setDriveAccessToken(credential?.accessToken ?? null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Google sign-in failed.";
      setError(message.replace("Firebase: ", ""));
    }
  }

  async function handleSignOut() {
    setDriveAccessToken(null);
    if (auth) {
      await signOut(auth);
    }
  }

  if (!hasFirebaseConfig) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 py-10">
        <section className="w-full max-w-2xl rounded-lg border border-line bg-white p-6 shadow-soft">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-md bg-coral text-white">
            <LockKeyhole size={22} aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold text-ink">Connect Firebase</h1>
          <p className="mt-3 text-sm leading-6 text-steel">
            Add your Firebase web app values to <code>.env.local</code>, then restart the
            dev server. Use <code>.env.example</code> for the required variable names.
          </p>
        </section>
      </main>
    );
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 text-sm text-steel">
        Checking your vault session...
      </main>
    );
  }

  if (user) {
    return (
      <ApplicationDashboard
        user={user}
        driveAccessToken={driveAccessToken}
        onConnectDrive={signInWithGoogle}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <main className="grid min-h-screen grid-cols-1 bg-mist lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.7fr)]">
      <section className="flex min-h-[46vh] flex-col justify-between bg-ink px-6 py-8 text-white lg:min-h-screen lg:px-12">
        <div className="flex items-center gap-3 text-sm font-medium text-white/80">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-spruce text-white">
            <BriefcaseBusiness size={19} aria-hidden="true" />
          </span>
          Resume Application Vault
        </div>
        <div className="max-w-2xl py-12">
          <h1 className="max-w-xl text-4xl font-semibold leading-tight sm:text-5xl">
            Track every job lead and keep resume links attached.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/72">
            Sign in with Google, upload a resume to your Drive, and save the Drive
            link alongside each application.
          </p>
        </div>
        <div className="grid gap-3 text-sm text-white/72 sm:grid-cols-3">
          <span className="border-t border-white/20 pt-3">Google sign-in</span>
          <span className="border-t border-white/20 pt-3">Drive resume links</span>
          <span className="border-t border-white/20 pt-3">Firestore tracker</span>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-soft">
          <div className="mb-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-spruce text-white">
              <LockKeyhole size={21} aria-hidden="true" />
            </div>
            <h2 className="text-2xl font-semibold text-ink">Sign in with Google</h2>
            <p className="mt-2 text-sm leading-6 text-steel">
              The app uses your Google account to save tracker data and upload
              selected resumes into your Google Drive.
            </p>
          </div>

          {error ? (
            <p className="mb-4 rounded-md border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={signInWithGoogle}
            className="h-11 w-full rounded-md bg-spruce px-4 text-sm font-semibold text-white transition hover:bg-[#195a50]"
          >
            Continue with Google
          </button>
        </div>
      </section>
    </main>
  );
}
