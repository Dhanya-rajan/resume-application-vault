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
      <main className="flex min-h-screen items-center justify-center bg-[#061012] px-5 py-10">
        <section className="w-full max-w-2xl rounded-lg border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-cyan-950/30">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-md bg-[#d99b2b] text-[#061012]">
            <LockKeyhole size={22} aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold text-white">Connect Firebase</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Add your Firebase web app values to <code>.env.local</code>, then restart the
            dev server. Use <code>.env.example</code> for the required variable names.
          </p>
        </section>
      </main>
    );
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#061012] px-5 text-sm text-cyan-100/70">
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
    <main className="grid min-h-screen grid-cols-1 overflow-hidden bg-[#061012] lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.7fr)]">
      <section className="relative flex min-h-[46vh] flex-col justify-between overflow-hidden bg-[#071214] px-6 py-8 text-white lg:min-h-screen lg:px-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_18%,rgba(44,214,194,0.24),transparent_32%),radial-gradient(circle_at_80%_40%,rgba(48,137,184,0.20),transparent_34%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent" />
        <div className="flex items-center gap-3 text-sm font-medium text-white/80">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#2cd6c2] text-[#041012] shadow-lg shadow-cyan-500/20">
            <BriefcaseBusiness size={19} aria-hidden="true" />
          </span>
          Resume Application Vault
        </div>
        <div className="relative max-w-2xl py-12">
          <h1 className="max-w-xl text-4xl font-semibold leading-tight sm:text-5xl">
            Job search command center.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/72">
            Sign in with Google, upload a resume to your Drive, and save the Drive
            link alongside each application in a private tracker.
          </p>
        </div>
        <div className="relative grid gap-3 text-sm text-white/72 sm:grid-cols-3">
          <span className="border-t border-cyan-200/20 pt-3">Google sign-in</span>
          <span className="border-t border-cyan-200/20 pt-3">Drive resume links</span>
          <span className="border-t border-cyan-200/20 pt-3">Metrics dashboard</span>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-md rounded-lg border border-white/10 bg-white/[0.07] p-6 shadow-2xl shadow-cyan-950/30 backdrop-blur">
          <div className="mb-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-[#2cd6c2] text-[#041012]">
              <LockKeyhole size={21} aria-hidden="true" />
            </div>
            <h2 className="text-2xl font-semibold text-white">Sign in with Google</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
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
            className="h-11 w-full rounded-md bg-[#2cd6c2] px-4 text-sm font-semibold text-[#041012] transition hover:bg-[#72efe0]"
          >
            Continue with Google
          </button>
        </div>
      </section>
    </main>
  );
}
