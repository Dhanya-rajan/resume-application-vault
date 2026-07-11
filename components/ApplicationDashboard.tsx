"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp
} from "firebase/firestore";
import {
  CalendarClock,
  ExternalLink,
  FileUp,
  LogOut,
  Mail,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  type ApplicationFormState,
  type ApplicationRecord,
  type ApplicationStatus,
  statusOptions
} from "@/types/application";

const emptyForm: ApplicationFormState = {
  company: "",
  role: "",
  jobUrl: "",
  status: "Saved",
  dateApplied: "",
  followUpDate: "",
  recruiterName: "",
  recruiterEmail: "",
  recruiterLinkedIn: "",
  resumeFileName: "",
  resumeDriveLink: "",
  resumeDriveFileId: "",
  jobDescription: "",
  notes: ""
};

export function ApplicationDashboard({
  user,
  driveAccessToken,
  onConnectDrive,
  onSignOut
}: {
  user: User;
  driveAccessToken: string | null;
  onConnectDrive: () => Promise<void>;
  onSignOut: () => void;
}) {
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ApplicationFormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ApplicationStatus>("All");
  const [resumeUpload, setResumeUpload] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!db) {
      return;
    }

    const applicationsQuery = query(
      collection(db, "applications"),
      where("uid", "==", user.uid)
    );

    return onSnapshot(
      applicationsQuery,
      (snapshot) => {
        const nextApplications = snapshot.docs
          .map((documentSnapshot) => ({
            id: documentSnapshot.id,
            ...documentSnapshot.data()
          }) as ApplicationRecord)
          .sort((left, right) => timestampMillis(right.updatedAt) - timestampMillis(left.updatedAt));

        setApplications(nextApplications);
      },
      (caught) => setError(caught.message)
    );
  }, [user.uid]);

  const filteredApplications = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return applications.filter((application) => {
      const matchesStatus =
        statusFilter === "All" || application.status === statusFilter;
      const searchable = [
        application.company,
        application.role,
        application.recruiterName,
        application.recruiterEmail,
        application.resumeFileName,
        application.jobDescription,
        application.notes
      ]
        .join(" ")
        .toLowerCase();

      return matchesStatus && (!needle || searchable.includes(needle));
    });
  }, [applications, search, statusFilter]);

  const activeApplication = applications.find((application) => application.id === selectedId);

  function selectApplication(application: ApplicationRecord) {
    setSelectedId(application.id);
    setForm({
      company: application.company,
      role: application.role,
      jobUrl: application.jobUrl,
      status: application.status,
      dateApplied: application.dateApplied,
      followUpDate: application.followUpDate,
      recruiterName: application.recruiterName,
      recruiterEmail: application.recruiterEmail,
      recruiterLinkedIn: application.recruiterLinkedIn,
      resumeFileName: application.resumeFileName ?? "",
      resumeDriveLink: application.resumeDriveLink ?? "",
      resumeDriveFileId: application.resumeDriveFileId ?? "",
      jobDescription: application.jobDescription,
      notes: application.notes
    });
    setResumeUpload(null);
    setNotice("");
    setError("");
  }

  function newApplication() {
    setSelectedId(null);
    setForm(emptyForm);
    setResumeUpload(null);
    setNotice("");
    setError("");
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!db) {
      setError("Firebase is not configured.");
      return;
    }

    if (!form.company.trim() || !form.role.trim()) {
      setError("Company and role are required.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      let resumeFields = {
        resumeFileName: form.resumeFileName,
        resumeDriveLink: form.resumeDriveLink,
        resumeDriveFileId: form.resumeDriveFileId
      };

      if (resumeUpload) {
        if (!driveAccessToken) {
          setError("Connect Google Drive before uploading a resume.");
          setIsSaving(false);
          return;
        }

        const driveFile = await uploadFileToDrive({
          accessToken: driveAccessToken,
          file: resumeUpload,
          company: form.company,
          role: form.role
        });

        resumeFields = {
          resumeFileName: driveFile.name,
          resumeDriveLink: driveFile.webViewLink,
          resumeDriveFileId: driveFile.id
        };
      }

      const payload = {
        uid: user.uid,
        company: form.company.trim(),
        role: form.role.trim(),
        jobUrl: form.jobUrl.trim(),
        status: form.status,
        dateApplied: form.dateApplied,
        followUpDate: form.followUpDate,
        recruiterName: form.recruiterName.trim(),
        recruiterEmail: form.recruiterEmail.trim(),
        recruiterLinkedIn: form.recruiterLinkedIn.trim(),
        ...resumeFields,
        jobDescription: form.jobDescription.trim(),
        notes: form.notes.trim(),
        updatedAt: serverTimestamp()
      };

      if (selectedId) {
        await updateDoc(doc(db, "applications", selectedId), payload);
      } else {
        const created = await addDoc(collection(db, "applications"), {
          ...payload,
          createdAt: serverTimestamp()
        });
        setSelectedId(created.id);
      }

      setForm((current) => ({ ...current, ...resumeFields }));
      setResumeUpload(null);
      setNotice(resumeUpload ? "Saved. Resume uploaded to Google Drive." : "Saved.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to save.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConnectDrive() {
    setIsConnectingDrive(true);
    setError("");

    try {
      await onConnectDrive();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to connect Google Drive.";
      setError(message);
    } finally {
      setIsConnectingDrive(false);
    }
  }

  async function removeApplication(application: ApplicationRecord) {
    if (!db) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${application.company} - ${application.role}?`
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setNotice("");

    try {
      await deleteDoc(doc(db, "applications", application.id));

      if (selectedId === application.id) {
        newApplication();
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to delete.";
      setError(message);
    }
  }

  return (
    <main className="min-h-screen bg-mist">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-spruce">
              Resume Application Vault
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-ink">Application dashboard</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="max-w-full truncate rounded-md border border-line px-3 py-2 text-sm text-steel">
              {user.email}
            </span>
            <button
              type="button"
              onClick={newApplication}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-spruce px-3 text-sm font-semibold text-white hover:bg-[#195a50]"
            >
              <Plus size={18} aria-hidden="true" />
              New
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-mist"
            >
              <LogOut size={18} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(310px,0.9fr)_minmax(0,1.35fr)]">
        <section className="min-w-0">
          <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_170px]">
            <label className="relative block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel"
                size={18}
                aria-hidden="true"
              />
              <span className="sr-only">Search applications</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search company, role, recruiter"
                className="h-11 w-full rounded-md border border-line bg-white pl-10 pr-3 text-sm text-ink"
              />
            </label>
            <label>
              <span className="sr-only">Filter by status</span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as "All" | ApplicationStatus)
                }
                className="h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
              >
                <option value="All">All statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3">
            {filteredApplications.length ? (
              filteredApplications.map((application) => (
                <article
                  key={application.id}
                  className={`rounded-lg border bg-white p-4 shadow-sm transition ${
                    selectedId === application.id
                      ? "border-spruce ring-2 ring-spruce/20"
                      : "border-line"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => selectApplication(application)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <h2 className="truncate text-base font-semibold text-ink">
                        {application.company}
                      </h2>
                      <p className="mt-1 truncate text-sm text-steel">{application.role}</p>
                    </button>
                    <span className="shrink-0 rounded-md bg-mist px-2 py-1 text-xs font-medium text-ink">
                      {application.status}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-steel">
                    {application.dateApplied ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1">
                        <CalendarClock size={14} aria-hidden="true" />
                        {application.dateApplied}
                      </span>
                    ) : null}
                    {application.recruiterName ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1">
                        <Mail size={14} aria-hidden="true" />
                        {application.recruiterName}
                      </span>
                    ) : null}
                    {application.resumeDriveLink ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1">
                        <FileUp size={14} aria-hidden="true" />
                        Resume linked
                      </span>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-line bg-white p-6 text-sm leading-6 text-steel">
                No applications match this view.
              </div>
            )}
          </div>
        </section>

        <section className="min-w-0 rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-ink">
                {selectedId ? "Edit application" : "New application"}
              </h2>
              <p className="mt-1 text-sm text-steel">
                Upload a resume to Google Drive and keep the link with this application.
              </p>
            </div>
            {activeApplication ? (
              <button
                type="button"
                onClick={() => removeApplication(activeApplication)}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-coral/40 px-3 text-sm font-medium text-coral hover:bg-coral/10"
              >
                <Trash2 size={17} aria-hidden="true" />
                Delete
              </button>
            ) : null}
          </div>

          {notice ? (
            <p className="mb-4 rounded-md border border-spruce/30 bg-spruce/10 px-3 py-2 text-sm text-spruce">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="mb-4 rounded-md border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
              {error}
            </p>
          ) : null}

          <form onSubmit={handleSave} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                label="Company"
                value={form.company}
                required
                onChange={(company) => setForm((current) => ({ ...current, company }))}
              />
              <TextInput
                label="Role"
                value={form.role}
                required
                onChange={(role) => setForm((current) => ({ ...current, role }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="text-sm font-medium text-ink">Status</span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as ApplicationStatus
                    }))
                  }
                  className="mt-2 h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <TextInput
                label="Date applied"
                type="date"
                value={form.dateApplied}
                onChange={(dateApplied) =>
                  setForm((current) => ({ ...current, dateApplied }))
                }
              />
              <TextInput
                label="Follow-up"
                type="date"
                value={form.followUpDate}
                onChange={(followUpDate) =>
                  setForm((current) => ({ ...current, followUpDate }))
                }
              />
            </div>

            <TextInput
              label="Job URL"
              type="url"
              value={form.jobUrl}
              onChange={(jobUrl) => setForm((current) => ({ ...current, jobUrl }))}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <TextInput
                label="Recruiter"
                value={form.recruiterName}
                onChange={(recruiterName) =>
                  setForm((current) => ({ ...current, recruiterName }))
                }
              />
              <TextInput
                label="Recruiter email"
                type="email"
                value={form.recruiterEmail}
                onChange={(recruiterEmail) =>
                  setForm((current) => ({ ...current, recruiterEmail }))
                }
              />
              <TextInput
                label="Recruiter LinkedIn"
                type="url"
                value={form.recruiterLinkedIn}
                onChange={(recruiterLinkedIn) =>
                  setForm((current) => ({ ...current, recruiterLinkedIn }))
                }
              />
            </div>

            <ResumeUpload
              driveConnected={Boolean(driveAccessToken)}
              fileName={form.resumeFileName}
              driveLink={form.resumeDriveLink}
              pendingFile={resumeUpload}
              isConnecting={isConnectingDrive}
              onConnectDrive={handleConnectDrive}
              onChooseFile={setResumeUpload}
              onClearPending={() => setResumeUpload(null)}
              onClearSaved={() =>
                setForm((current) => ({
                  ...current,
                  resumeFileName: "",
                  resumeDriveLink: "",
                  resumeDriveFileId: ""
                }))
              }
            />

            <TextArea
              label="Job description"
              value={form.jobDescription}
              onChange={(jobDescription) =>
                setForm((current) => ({ ...current, jobDescription }))
              }
            />
            <TextArea
              label="Notes"
              value={form.notes}
              rows={4}
              onChange={(notes) => setForm((current) => ({ ...current, notes }))}
            />

            <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={newApplication}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm font-medium text-ink hover:bg-mist"
              >
                <Pencil size={17} aria-hidden="true" />
                Clear
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-spruce px-4 text-sm font-semibold text-white hover:bg-[#195a50] disabled:cursor-not-allowed disabled:opacity-65"
              >
                <Save size={17} aria-hidden="true" />
                {isSaving ? "Saving..." : "Save application"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function ResumeUpload({
  driveConnected,
  fileName,
  driveLink,
  pendingFile,
  isConnecting,
  onConnectDrive,
  onChooseFile,
  onClearPending,
  onClearSaved
}: {
  driveConnected: boolean;
  fileName: string;
  driveLink: string;
  pendingFile: File | null;
  isConnecting: boolean;
  onConnectDrive: () => void;
  onChooseFile: (file: File) => void;
  onClearPending: () => void;
  onClearSaved: () => void;
}) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    onChooseFile(file);
    event.target.value = "";
  }

  return (
    <section className="rounded-lg border border-line p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">Resume</h3>
          <p className="mt-1 text-sm leading-6 text-steel">
            Choose a resume and save the application to upload it to Google Drive.
          </p>
        </div>
        <button
          type="button"
          onClick={onConnectDrive}
          disabled={isConnecting}
          className="inline-flex h-10 items-center justify-center rounded-md border border-line px-3 text-sm font-medium text-ink hover:bg-mist disabled:cursor-not-allowed disabled:opacity-65"
        >
          {driveConnected ? "Drive connected" : isConnecting ? "Connecting..." : "Connect Drive"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-spruce px-3 text-sm font-semibold text-white hover:bg-[#195a50]">
          <FileUp size={17} aria-hidden="true" />
          Choose resume
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={handleChange}
            className="sr-only"
          />
        </label>
        {pendingFile ? (
          <button
            type="button"
            onClick={onClearPending}
            className="h-10 rounded-md border border-line px-3 text-sm font-medium text-ink hover:bg-mist"
          >
            Clear selected file
          </button>
        ) : null}
      </div>

      {pendingFile ? (
        <p className="mt-3 rounded-md bg-marigold/12 px-3 py-2 text-sm text-ink">
          Ready to upload: {pendingFile.name}
        </p>
      ) : null}

      {driveLink ? (
        <div className="mt-3 flex flex-col gap-2 rounded-md bg-mist px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 truncate font-medium text-ink">{fileName || "Resume"}</span>
          <div className="flex flex-wrap gap-2">
            <a
              href={driveLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-mist"
            >
              <ExternalLink size={16} aria-hidden="true" />
              Open
            </a>
            <button
              type="button"
              onClick={onClearSaved}
              className="h-9 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-mist"
            >
              Remove link
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  required = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");

  return (
    <label className="block" htmlFor={id}>
      <span className="text-sm font-medium text-ink">{label}</span>
      <input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 7
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");

  return (
    <label className="block" htmlFor={id}>
      <span className="text-sm font-medium text-ink">{label}</span>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 text-ink"
      />
    </label>
  );
}

function timestampMillis(timestamp: Timestamp | null | undefined) {
  return timestamp?.toMillis ? timestamp.toMillis() : 0;
}

async function uploadFileToDrive({
  accessToken,
  file,
  company,
  role
}: {
  accessToken: string;
  file: File;
  company: string;
  role: string;
}) {
  const metadata = {
    name: [company.trim(), role.trim(), file.name].filter(Boolean).join(" - "),
    mimeType: file.type || "application/octet-stream"
  };
  const boundary = `resume_vault_${Date.now()}`;
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const body = new Blob(
    [
      delimiter,
      "Content-Type: application/json; charset=UTF-8\r\n\r\n",
      JSON.stringify(metadata),
      delimiter,
      `Content-Type: ${metadata.mimeType}\r\n\r\n`,
      file,
      closeDelimiter
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google Drive upload failed: ${details}`);
  }

  return (await response.json()) as {
    id: string;
    name: string;
    webViewLink: string;
  };
}
