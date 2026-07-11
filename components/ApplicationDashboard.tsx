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
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes
} from "firebase/storage";
import {
  CalendarClock,
  Download,
  FileText,
  LogOut,
  Mail,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { db, storage } from "@/lib/firebase";
import {
  type ApplicationFormState,
  type ApplicationRecord,
  type ApplicationStatus,
  statusOptions,
  type StoredFile
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
  jobDescription: "",
  notes: "",
  resumeFile: null,
  jobDescriptionFile: null
};

const allowedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain"
]);

type UploadSlot = "resumeFile" | "jobDescriptionFile";

export function ApplicationDashboard({
  user,
  onSignOut
}: {
  user: User;
  onSignOut: () => void;
}) {
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ApplicationFormState>(emptyForm);
  const [resumeUpload, setResumeUpload] = useState<File | null>(null);
  const [jdUpload, setJdUpload] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ApplicationStatus>("All");
  const [isSaving, setIsSaving] = useState(false);
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
      jobDescription: application.jobDescription,
      notes: application.notes,
      resumeFile: application.resumeFile,
      jobDescriptionFile: application.jobDescriptionFile
    });
    setResumeUpload(null);
    setJdUpload(null);
    setNotice("");
    setError("");
  }

  function newApplication() {
    setSelectedId(null);
    setForm(emptyForm);
    setResumeUpload(null);
    setJdUpload(null);
    setNotice("");
    setError("");
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!db || !storage) {
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
      const basePayload = {
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
        jobDescription: form.jobDescription.trim(),
        notes: form.notes.trim(),
        updatedAt: serverTimestamp()
      };

      let applicationId = selectedId;

      if (applicationId) {
        await updateDoc(doc(db, "applications", applicationId), basePayload);
      } else {
        const created = await addDoc(collection(db, "applications"), {
          ...basePayload,
          resumeFile: null,
          jobDescriptionFile: null,
          createdAt: serverTimestamp()
        });
        applicationId = created.id;
        setSelectedId(created.id);
      }

      const fileUpdates: Partial<Pick<ApplicationRecord, "resumeFile" | "jobDescriptionFile">> = {};

      if (resumeUpload) {
        if (form.resumeFile?.storagePath) {
          await deleteStoredFile(form.resumeFile.storagePath);
        }
        fileUpdates.resumeFile = await uploadStoredFile(
          user.uid,
          applicationId,
          resumeUpload,
          "resume"
        );
      }

      if (jdUpload) {
        if (form.jobDescriptionFile?.storagePath) {
          await deleteStoredFile(form.jobDescriptionFile.storagePath);
        }
        fileUpdates.jobDescriptionFile = await uploadStoredFile(
          user.uid,
          applicationId,
          jdUpload,
          "job-description"
        );
      }

      if (Object.keys(fileUpdates).length > 0) {
        await updateDoc(doc(db, "applications", applicationId), {
          ...fileUpdates,
          updatedAt: serverTimestamp()
        });
      }

      setResumeUpload(null);
      setJdUpload(null);
      setNotice(
        "Saved. Uploaded files are in Firebase now, so the matching local Downloads copies can be deleted."
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to save.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function removeApplication(application: ApplicationRecord) {
    if (!db) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${application.company} - ${application.role} and its stored files?`
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setNotice("");

    try {
      await Promise.all([
        application.resumeFile?.storagePath
          ? deleteStoredFile(application.resumeFile.storagePath)
          : Promise.resolve(),
        application.jobDescriptionFile?.storagePath
          ? deleteStoredFile(application.jobDescriptionFile.storagePath)
          : Promise.resolve()
      ]);
      await deleteDoc(doc(db, "applications", application.id));

      if (selectedId === application.id) {
        newApplication();
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to delete.";
      setError(message);
    }
  }

  async function removeFile(slot: UploadSlot) {
    if (!db || !selectedId || !form[slot]?.storagePath) {
      return;
    }

    try {
      await deleteStoredFile(form[slot]!.storagePath);
      await updateDoc(doc(db, "applications", selectedId), {
        [slot]: null,
        updatedAt: serverTimestamp()
      });
      setForm((current) => ({ ...current, [slot]: null }));
      setNotice("Stored file deleted from Firebase.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to delete file.";
      setError(message);
    }
  }

  async function downloadFile(file: StoredFile) {
    if (!storage) {
      return;
    }

    const url = await getDownloadURL(ref(storage, file.storagePath));
    window.open(url, "_blank", "noopener,noreferrer");
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
                    {application.resumeFile ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1">
                        <FileText size={14} aria-hidden="true" />
                        Resume stored
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
                Files upload to Firebase after saving.
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

            <div className="grid gap-4 md:grid-cols-2">
              <FileControl
                label="Resume file"
                storedFile={form.resumeFile}
                pendingFile={resumeUpload}
                onChoose={(file) => setResumeUpload(file)}
                onDownload={downloadFile}
                onRemoveStored={() => removeFile("resumeFile")}
                onClearPending={() => setResumeUpload(null)}
              />
              <FileControl
                label="Job description file"
                storedFile={form.jobDescriptionFile}
                pendingFile={jdUpload}
                onChoose={(file) => setJdUpload(file)}
                onDownload={downloadFile}
                onRemoveStored={() => removeFile("jobDescriptionFile")}
                onClearPending={() => setJdUpload(null)}
              />
            </div>

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

function FileControl({
  label,
  storedFile,
  pendingFile,
  onChoose,
  onDownload,
  onRemoveStored,
  onClearPending
}: {
  label: string;
  storedFile: StoredFile | null;
  pendingFile: File | null;
  onChoose: (file: File) => void;
  onDownload: (file: StoredFile) => void;
  onRemoveStored: () => void;
  onClearPending: () => void;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!allowedTypes.has(file.type)) {
      window.alert("Please choose a PDF, DOCX, or TXT file.");
      event.target.value = "";
      return;
    }

    onChoose(file);
  }

  return (
    <div className="rounded-lg border border-line p-4">
      <label className="block text-sm font-medium text-ink" htmlFor={id}>
        {label}
      </label>
      <div className="mt-3 flex min-h-11 flex-wrap items-center gap-2">
        <label
          htmlFor={id}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-line px-3 text-sm font-medium text-ink hover:bg-mist"
        >
          <Upload size={17} aria-hidden="true" />
          Choose file
        </label>
        <input
          id={id}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          onChange={handleChange}
          className="sr-only"
        />
      </div>

      {pendingFile ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-marigold/12 px-3 py-2 text-sm text-ink">
          <span className="min-w-0 truncate">{pendingFile.name}</span>
          <button
            type="button"
            onClick={onClearPending}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-white text-ink hover:bg-mist"
            aria-label={`Clear pending ${label}`}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {storedFile ? (
        <div className="mt-3 grid gap-2 rounded-md bg-mist px-3 py-3 text-sm">
          <span className="truncate font-medium text-ink">{storedFile.name}</span>
          <span className="text-xs text-steel">{formatBytes(storedFile.size)}</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onDownload(storedFile)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-mist"
            >
              <Download size={16} aria-hidden="true" />
              Open
            </button>
            <button
              type="button"
              onClick={onRemoveStored}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-coral/40 bg-white px-3 text-sm font-medium text-coral hover:bg-coral/10"
            >
              <Trash2 size={16} aria-hidden="true" />
              Delete
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function uploadStoredFile(
  uid: string,
  applicationId: string,
  file: File,
  label: string
): Promise<StoredFile> {
  if (!storage) {
    throw new Error("Firebase Storage is not configured.");
  }

  const extension = file.name.includes(".") ? file.name.split(".").pop() : "file";
  const cleanLabel = label.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const storagePath = `users/${uid}/applications/${applicationId}/${cleanLabel}-${Date.now()}.${extension}`;
  const fileReference = ref(storage, storagePath);

  await uploadBytes(fileReference, file, {
    contentType: file.type
  });

  return {
    name: file.name,
    type: file.type,
    size: file.size,
    storagePath,
    uploadedAt: serverTimestamp() as Timestamp
  };
}

async function deleteStoredFile(storagePath: string) {
  if (!storage) {
    return;
  }

  try {
    await deleteObject(ref(storage, storagePath));
  } catch (caught) {
    const error = caught as { code?: string };
    if (error.code !== "storage/object-not-found") {
      throw caught;
    }
  }
}

function timestampMillis(timestamp: Timestamp | null | undefined) {
  return timestamp?.toMillis ? timestamp.toMillis() : 0;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
