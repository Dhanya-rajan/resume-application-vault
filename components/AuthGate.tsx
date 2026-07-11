"use client";

import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User
} from "firebase/auth";
import { BriefcaseBusiness, LockKeyhole, Mail } from "lucide-react";
import { ApplicationDashboard } from "@/components/ApplicationDashboard";
import { auth, hasFirebaseConfig } from "@/lib/firebase";

export function AuthGate() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isCreating, setIsCreating] = useState(false);
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth) {
      setError("Firebase is not configured yet.");
      return;
    }

    setError("");

    try {
      if (isCreating) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Authentication failed.";
      setError(message.replace("Firebase: ", ""));
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
    return <ApplicationDashboard user={user} onSignOut={() => auth && signOut(auth)} />;
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
            Keep every tailored resume and job lead in one private place.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/72">
            Upload the resume and job description, track the recruiter, and keep the
            cloud copy even after cleaning out Downloads.
          </p>
        </div>
        <div className="grid gap-3 text-sm text-white/72 sm:grid-cols-3">
          <span className="border-t border-white/20 pt-3">PDF, DOCX, TXT uploads</span>
          <span className="border-t border-white/20 pt-3">Email login</span>
          <span className="border-t border-white/20 pt-3">Firebase storage</span>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-8">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-soft"
        >
          <div className="mb-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-spruce text-white">
              <Mail size={21} aria-hidden="true" />
            </div>
            <h2 className="text-2xl font-semibold text-ink">
              {isCreating ? "Create your login" : "Sign in"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-steel">
              Your records and files are tied to this email account.
            </p>
          </div>

          <label className="block text-sm font-medium text-ink" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 h-11 w-full rounded-md border border-line bg-white px-3 text-ink"
            autoComplete="email"
          />

          <label className="mt-4 block text-sm font-medium text-ink" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 h-11 w-full rounded-md border border-line bg-white px-3 text-ink"
            autoComplete={isCreating ? "new-password" : "current-password"}
          />

          {error ? (
            <p className="mt-4 rounded-md border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="mt-6 h-11 w-full rounded-md bg-spruce px-4 text-sm font-semibold text-white transition hover:bg-[#195a50]"
          >
            {isCreating ? "Create account" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => setIsCreating((value) => !value)}
            className="mt-3 h-10 w-full rounded-md border border-line px-4 text-sm font-medium text-ink transition hover:bg-mist"
          >
            {isCreating ? "Use existing account" : "Create a new account"}
          </button>
        </form>
      </section>
    </main>
  );
}
