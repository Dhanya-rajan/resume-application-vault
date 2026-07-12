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
  setDoc,
  updateDoc,
  where,
  type Timestamp
} from "firebase/firestore";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  FileText,
  FileUp,
  Folder,
  Gauge,
  LibraryBig,
  Link,
  LogOut,
  Mail,
  Pencil,
  Plus,
  Save,
  Search,
  Settings,
  Table2,
  Trash2,
  TrendingUp,
  TriangleAlert
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  type ApplicationFormState,
  type ApplicationRecord,
  type ApplicationStatus,
  type MasterResumeRecord,
  type UserSettings,
  statusOptions
} from "@/types/application";

type AppTab = "dashboard" | "applications" | "table" | "masters" | "settings";
type SortKey =
  | "company"
  | "role"
  | "status"
  | "dateApplied"
  | "followUpDate"
  | "recruiterName"
  | "resumeFileName";
type SortDirection = "asc" | "desc";

type DriveUploadResult = {
  id: string;
  name: string;
  webViewLink: string;
};

const emptyForm: ApplicationFormState = {
  company: "",
  role: "",
  jobUrl: "",
  status: "To Do",
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

const tabItems: Array<{ id: AppTab; label: string; icon: typeof BarChart3 }> = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "applications", label: "Applications", icon: BriefcaseBusiness },
  { id: "table", label: "Table", icon: Table2 },
  { id: "masters", label: "Master Resumes", icon: LibraryBig },
  { id: "settings", label: "Settings", icon: Settings }
];

const statusTone: Record<ApplicationStatus, string> = {
  "To Do": "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  Applied: "border-teal-300/25 bg-teal-300/10 text-teal-100",
  "Recruiter screen": "border-sky-300/25 bg-sky-300/10 text-sky-100",
  Interviewing: "border-blue-300/25 bg-blue-300/10 text-blue-100",
  Offer: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  Rejected: "border-rose-300/25 bg-rose-300/10 text-rose-100",
  Ghosted: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  Withdrawn: "border-slate-300/20 bg-slate-300/10 text-slate-200"
};

const pipelineStatuses: ApplicationStatus[] = [
  "To Do",
  "Applied",
  "Recruiter screen",
  "Interviewing",
  "Offer",
  "Rejected",
  "Withdrawn",
  "Ghosted"
];

const pipelineColors: Record<ApplicationStatus, string> = {
  "To Do": "#8ba4b8",
  Applied: "#2cd6c2",
  "Recruiter screen": "#67e8f9",
  Interviewing: "#60a5fa",
  Offer: "#7ddf8a",
  Rejected: "#fb7185",
  Withdrawn: "#64748b",
  Ghosted: "#fbbf24"
};

const ghostedAfterDays = 28;

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
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [masterResumes, setMasterResumes] = useState<MasterResumeRecord[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ApplicationFormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ApplicationStatus>("All");
  const [resumeUpload, setResumeUpload] = useState<File | null>(null);
  const [resumeUploadName, setResumeUploadName] = useState("");
  const [masterUpload, setMasterUpload] = useState<File | null>(null);
  const [masterUploadName, setMasterUploadName] = useState("");
  const [masterNotes, setMasterNotes] = useState("");
  const [masterTags, setMasterTags] = useState("");
  const [folderInput, setFolderInput] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("dateApplied");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isSaving, setIsSaving] = useState(false);
  const [isMasterSaving, setIsMasterSaving] = useState(false);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [isFolderSaving, setIsFolderSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!db) {
      return;
    }

    const database = db;
    const applicationsQuery = query(
      collection(database, "applications"),
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

        const todayStart = startOfToday();
        for (const documentSnapshot of snapshot.docs) {
          const application = {
            id: documentSnapshot.id,
            ...documentSnapshot.data()
          } as ApplicationRecord;

          if (shouldAutoGhost(application, todayStart)) {
            void updateDoc(doc(database, "applications", application.id), {
              status: "Ghosted",
              updatedAt: serverTimestamp()
            });
          }
        }
      },
      (caught) => setError(caught.message)
    );
  }, [user.uid]);

  useEffect(() => {
    if (!db) {
      return;
    }

    return onSnapshot(doc(db, "userSettings", user.uid), (snapshot) => {
      if (!snapshot.exists()) {
        setUserSettings(null);
        return;
      }

      setUserSettings(snapshot.data() as UserSettings);
    });
  }, [user.uid]);

  useEffect(() => {
    if (!db) {
      return;
    }

    const resumesQuery = query(
      collection(db, "masterResumes"),
      where("uid", "==", user.uid)
    );

    return onSnapshot(
      resumesQuery,
      (snapshot) => {
        const nextResumes = snapshot.docs
          .map((documentSnapshot) => ({
            id: documentSnapshot.id,
            ...documentSnapshot.data()
          }) as MasterResumeRecord)
          .sort((left, right) => timestampMillis(right.createdAt) - timestampMillis(left.createdAt));

        setMasterResumes(nextResumes);
      },
      (caught) => setError(caught.message)
    );
  }, [user.uid]);

  const normalizedApplications = useMemo(
    () =>
      applications.map((application) => ({
        ...application,
        status: normalizeStatus(application.status)
      })),
    [applications]
  );

  const metrics = useMemo(() => calculateMetrics(normalizedApplications), [normalizedApplications]);

  const filteredApplications = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return normalizedApplications.filter((application) => {
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
  }, [normalizedApplications, search, statusFilter]);

  const sortedTableApplications = useMemo(
    () =>
      [...filteredApplications].sort((left, right) => {
        const leftValue = tableSortValue(left, sortKey);
        const rightValue = tableSortValue(right, sortKey);
        const result = leftValue.localeCompare(rightValue, undefined, {
          numeric: true,
          sensitivity: "base"
        });

        return sortDirection === "asc" ? result : -result;
      }),
    [filteredApplications, sortDirection, sortKey]
  );

  const activeApplication = normalizedApplications.find(
    (application) => application.id === selectedId
  );

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

  function selectApplication(application: ApplicationRecord) {
    setSelectedId(application.id);
    setForm({
      company: application.company,
      role: application.role,
      jobUrl: application.jobUrl,
      status: normalizeStatus(application.status),
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
    setResumeUploadName("");
    setNotice("");
    setError("");
  }

  function openApplication(application: ApplicationRecord) {
    selectApplication(application);
    setActiveTab("applications");
  }

  function newApplication() {
    setSelectedId(null);
    setForm(emptyForm);
    setResumeUpload(null);
    setResumeUploadName("");
    setNotice("");
    setError("");
    setActiveTab("applications");
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
        const driveFile = await uploadResumeFile({
          accessToken: driveAccessToken,
          file: resumeUpload,
          company: form.company,
          role: form.role,
          uploadName: resumeUploadName,
          folderId: userSettings?.driveFolderId ?? ""
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
      setResumeUploadName("");
      setNotice(resumeUpload ? "Saved. Resume uploaded to Google Drive." : "Saved.");
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

  async function createDriveFolder() {
    if (!db) {
      return;
    }

    setIsFolderSaving(true);
    setError("");
    setNotice("");

    try {
      if (!driveAccessToken) {
        await handleConnectDrive();
      }

      if (!driveAccessToken) {
        throw new Error("Connect Google Drive, then create the folder.");
      }

      const folder = await createFolderInDrive(driveAccessToken, "Resume Application Vault");
      await saveUserSettings(folder.id, folder.name, folder.webViewLink);
      setNotice("Drive folder saved. Future uploads will land there.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to create Drive folder.";
      setError(message);
    } finally {
      setIsFolderSaving(false);
    }
  }

  async function saveFolderFromInput() {
    if (!folderInput.trim()) {
      setError("Paste a Google Drive folder link or folder ID.");
      return;
    }

    const folderId = parseDriveFolderId(folderInput);

    if (!folderId) {
      setError("That does not look like a Google Drive folder link or ID.");
      return;
    }

    setIsFolderSaving(true);
    setError("");
    setNotice("");

    try {
      await saveUserSettings(
        folderId,
        "Selected Drive folder",
        `https://drive.google.com/drive/folders/${folderId}`
      );
      setFolderInput("");
      setNotice("Drive folder saved.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to save folder.";
      setError(message);
    } finally {
      setIsFolderSaving(false);
    }
  }

  async function saveUserSettings(folderId: string, folderName: string, folderLink: string) {
    if (!db) {
      throw new Error("Firebase is not configured.");
    }

    await setDoc(
      doc(db, "userSettings", user.uid),
      {
        uid: user.uid,
        driveFolderId: folderId,
        driveFolderName: folderName,
        driveFolderLink: folderLink,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  }

  async function uploadMasterResume(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!db) {
      setError("Firebase is not configured.");
      return;
    }

    if (!masterUpload) {
      setError("Choose a master resume file first.");
      return;
    }

    setIsMasterSaving(true);
    setError("");
    setNotice("");

    try {
      const driveFile = await uploadResumeFile({
        accessToken: driveAccessToken,
        file: masterUpload,
        company: "Master",
        role: "base resume",
        uploadName: masterUploadName || buildDriveFileName(masterUpload, "Master", "base resume"),
        folderId: userSettings?.driveFolderId ?? ""
      });

      await addDoc(collection(db, "masterResumes"), {
        uid: user.uid,
        name: driveFile.name,
        notes: masterNotes.trim(),
        tags: masterTags.trim(),
        driveFileId: driveFile.id,
        driveLink: driveFile.webViewLink,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setMasterUpload(null);
      setMasterUploadName("");
      setMasterNotes("");
      setMasterTags("");
      setNotice("Master resume uploaded to Google Drive.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to upload master resume.";
      setError(message);
    } finally {
      setIsMasterSaving(false);
    }
  }

  async function deleteMasterResume(resume: MasterResumeRecord) {
    if (!db) {
      return;
    }

    const confirmed = window.confirm(`Remove ${resume.name} from the tracker?`);

    if (!confirmed) {
      return;
    }

    await deleteDoc(doc(db, "masterResumes", resume.id));
  }

  function changeSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection("asc");
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#061012] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(44,214,194,0.18),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(45,120,160,0.16),transparent_30%),linear-gradient(180deg,#061012_0%,#08191b_45%,#05090b_100%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col px-4 py-4 sm:px-6 lg:px-7">
        <AppHeader
          user={user}
          onNewApplication={newApplication}
          onSignOut={onSignOut}
        />

        <div className="mt-4 grid flex-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-white/10 bg-white/[0.055] p-3 shadow-2xl shadow-cyan-950/20 backdrop-blur">
            <nav className="grid gap-1">
              {tabItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
                      isActive
                        ? "bg-[#2cd6c2] text-[#041012] shadow-lg shadow-cyan-500/20"
                        : "text-slate-300 hover:bg-white/[0.07] hover:text-white"
                    }`}
                  >
                    <Icon size={18} aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <div className="mt-4 rounded-lg border border-cyan-200/10 bg-[#061012]/65 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/60">
                Drive Folder
              </p>
              <p className="mt-2 truncate text-sm text-slate-200">
                {userSettings?.driveFolderName || "Not selected"}
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("settings")}
                className="mt-3 h-9 w-full rounded-md border border-white/10 text-sm font-medium text-cyan-100 hover:bg-white/[0.07]"
              >
                Configure
              </button>
            </div>
          </aside>

          <section className="min-w-0">
            {(notice || error) ? (
              <div className="mb-4 grid gap-2">
                {notice ? (
                  <p className="rounded-md border border-teal-300/20 bg-teal-300/10 px-3 py-2 text-sm text-teal-100">
                    {notice}
                  </p>
                ) : null}
                {error ? (
                  <p className="rounded-md border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">
                    {error}
                  </p>
                ) : null}
              </div>
            ) : null}

            {activeTab === "dashboard" ? (
              <DashboardView
                applications={normalizedApplications}
                metrics={metrics}
                onOpenApplication={openApplication}
              />
            ) : null}

            {activeTab === "applications" ? (
              <ApplicationsView
                activeApplication={activeApplication}
                applications={filteredApplications}
                driveConnected={Boolean(driveAccessToken)}
                form={form}
                isConnectingDrive={isConnectingDrive}
                isSaving={isSaving}
                resumeUpload={resumeUpload}
                resumeUploadName={resumeUploadName}
                search={search}
                statusFilter={statusFilter}
                userSettings={userSettings}
                onClearSavedResume={() =>
                  setForm((current) => ({
                    ...current,
                    resumeFileName: "",
                    resumeDriveLink: "",
                    resumeDriveFileId: ""
                  }))
                }
                onConnectDrive={handleConnectDrive}
                onDelete={removeApplication}
                onNew={newApplication}
                onSave={handleSave}
                onSearch={setSearch}
                onSelect={selectApplication}
                onSetForm={setForm}
                onSetResumeUpload={(file) => {
                  setResumeUpload(file);
                  setResumeUploadName(buildDriveFileName(file, form.company, form.role));
                }}
                onSetResumeUploadName={setResumeUploadName}
                onClearResumeUpload={() => {
                  setResumeUpload(null);
                  setResumeUploadName("");
                }}
                onStatusFilter={setStatusFilter}
              />
            ) : null}

            {activeTab === "table" ? (
              <TableView
                applications={sortedTableApplications}
                sortDirection={sortDirection}
                sortKey={sortKey}
                onOpenApplication={openApplication}
                onSort={changeSort}
              />
            ) : null}

            {activeTab === "masters" ? (
              <MasterResumesView
                driveConnected={Boolean(driveAccessToken)}
                isConnectingDrive={isConnectingDrive}
                isSaving={isMasterSaving}
                masterNotes={masterNotes}
                masterResumes={masterResumes}
                masterTags={masterTags}
                masterUpload={masterUpload}
                masterUploadName={masterUploadName}
                userSettings={userSettings}
                onConnectDrive={handleConnectDrive}
                onDelete={deleteMasterResume}
                onNotes={setMasterNotes}
                onSave={uploadMasterResume}
                onTags={setMasterTags}
                onUpload={(file) => {
                  setMasterUpload(file);
                  setMasterUploadName(buildDriveFileName(file, "Master", "base resume"));
                }}
                onUploadName={setMasterUploadName}
                onClearUpload={() => {
                  setMasterUpload(null);
                  setMasterUploadName("");
                }}
              />
            ) : null}

            {activeTab === "settings" ? (
              <SettingsView
                driveConnected={Boolean(driveAccessToken)}
                folderInput={folderInput}
                isConnectingDrive={isConnectingDrive}
                isSaving={isFolderSaving}
                userSettings={userSettings}
                onConnectDrive={handleConnectDrive}
                onCreateFolder={createDriveFolder}
                onFolderInput={setFolderInput}
                onSaveFolder={saveFolderFromInput}
              />
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

function AppHeader({
  user,
  onNewApplication,
  onSignOut
}: {
  user: User;
  onNewApplication: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="rounded-lg border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-cyan-950/20 backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
            Resume Application Vault
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#2cd6c2] text-[#041012] shadow-lg shadow-cyan-500/20">
              <Gauge size={20} aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-white">Job search command center</h1>
              <p className="mt-1 text-sm text-slate-400">Track, compare, and follow up without losing the thread.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="max-w-full truncate rounded-md border border-white/10 bg-[#061012]/70 px-3 py-2 text-sm text-slate-300">
            {user.email}
          </span>
          <button
            type="button"
            onClick={onNewApplication}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#2cd6c2] px-3 text-sm font-semibold text-[#041012] hover:bg-[#72efe0]"
          >
            <Plus size={18} aria-hidden="true" />
            New
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 hover:bg-white/[0.07]"
          >
            <LogOut size={18} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

function DashboardView({
  applications,
  metrics,
  onOpenApplication
}: {
  applications: ApplicationRecord[];
  metrics: ReturnType<typeof calculateMetrics>;
  onOpenApplication: (application: ApplicationRecord) => void;
}) {
  const statCards = [
    { label: "Applications Submitted", value: metrics.submitted, icon: BriefcaseBusiness },
    { label: "Interviews Received", value: metrics.interviews, icon: CalendarClock },
    { label: "Offers Received", value: metrics.offers, icon: CheckCircle2 },
    { label: "Rejections", value: metrics.rejections, icon: TriangleAlert },
    { label: "Response Rate", value: `${metrics.responseRate}%`, icon: TrendingUp },
    { label: "Interview Rate", value: `${metrics.interviewRate}%`, icon: BarChart3 },
    { label: "Offer Rate", value: `${metrics.offerRate}%`, icon: Gauge },
    { label: "Avg Days Since Applied", value: metrics.averageDaysSinceApplication, icon: ClockIcon },
    { label: "Applications This Week", value: metrics.thisWeek, icon: CalendarClock },
    { label: "Active Applications", value: metrics.active, icon: CircleDot }
  ];

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-lg border border-white/10 bg-white/[0.055] p-4 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{card.label}</p>
                <Icon size={18} className="text-[#2cd6c2]" aria-hidden="true" />
              </div>
              <p className="mt-4 text-3xl font-semibold text-white">{card.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Panel title="Weekly Application Trend" eyebrow="Momentum">
          <div className="flex h-56 items-end gap-2">
            {metrics.weekBuckets.map((bucket) => (
              <div key={bucket.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex h-44 w-full items-end rounded-md border border-white/10 bg-[#061012]/65 p-1">
                  <div
                    className="w-full rounded bg-gradient-to-t from-[#2cd6c2] to-[#8be8ff]"
                    style={{ height: `${Math.max(8, bucket.percent)}%` }}
                  />
                </div>
                <span className="truncate text-xs text-slate-400">{bucket.label}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Applications by Status" eyebrow="Pipeline">
          <div className="grid gap-3">
            {statusOptions.map((status) => (
              <div key={status}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-slate-300">{status}</span>
                  <span className="text-slate-400">{metrics.statusCounts[status] ?? 0}</span>
                </div>
                <div className="h-2 rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full bg-[#2cd6c2]"
                    style={{
                      width: `${metrics.total ? ((metrics.statusCounts[status] ?? 0) / metrics.total) * 100 : 0}%`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Pipeline Breakdown" eyebrow="Status mix">
        <PipelineBreakdown
          items={metrics.pipelineBreakdown}
          total={metrics.total}
        />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Follow-ups Due" eyebrow="Attention">
          <ApplicationMiniList
            applications={[...metrics.overdueFollowUps, ...metrics.dueTodayFollowUps].slice(0, 6)}
            empty="No follow-ups due."
            onOpenApplication={onOpenApplication}
          />
        </Panel>
        <Panel title="Oldest Active Applications" eyebrow="Aging">
          <ApplicationMiniList
            applications={metrics.oldestActive.slice(0, 6)}
            empty="No active applications yet."
            onOpenApplication={onOpenApplication}
          />
        </Panel>
      </div>
    </div>
  );
}

function PipelineBreakdown({
  items,
  total
}: {
  items: Array<{ status: ApplicationStatus; count: number; percent: number }>;
  total: number;
}) {
  let offset = 25;
  const visibleItems = items.filter((item) => item.count > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-center">
      <div className="relative mx-auto h-64 w-64">
        {total ? (
          <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
            <circle
              cx="21"
              cy="21"
              r="15.9155"
              fill="transparent"
              stroke="rgba(255,255,255,0.09)"
              strokeWidth="6"
            />
            {visibleItems.map((item) => {
              const dash = `${item.percent} ${100 - item.percent}`;
              const currentOffset = offset;
              offset -= item.percent;

              return (
                <circle
                  key={item.status}
                  cx="21"
                  cy="21"
                  r="15.9155"
                  fill="transparent"
                  stroke={pipelineColors[item.status]}
                  strokeDasharray={dash}
                  strokeDashoffset={currentOffset}
                  strokeLinecap="round"
                  strokeWidth="6"
                  className="cursor-help transition-opacity hover:opacity-80 focus:opacity-80"
                  tabIndex={0}
                  aria-label={`${item.status}: ${item.count} applications, ${item.percent}%`}
                >
                  <title>{`${item.status}: ${item.count} applications (${item.percent}%)`}</title>
                </circle>
              );
            })}
          </svg>
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full border border-dashed border-white/15 text-sm text-slate-400">
            No data yet
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full border border-white/10 bg-[#061012]/90 px-6 py-5 text-center shadow-2xl shadow-cyan-950/30">
            <p className="text-3xl font-semibold text-white">{total}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-cyan-100/60">
              Total
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.status}
            className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-[#061012]/65 px-3 py-2"
            title={`${item.status}: ${item.count} applications (${item.percent}%)`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: pipelineColors[item.status] }}
              />
              <span className="truncate text-sm text-slate-200">{item.status}</span>
            </span>
            <span className="shrink-0 text-sm font-semibold text-white">
              {item.count}
              <span className="ml-2 text-xs font-medium text-slate-400">{item.percent}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApplicationsView({
  activeApplication,
  applications,
  driveConnected,
  form,
  isConnectingDrive,
  isSaving,
  resumeUpload,
  resumeUploadName,
  search,
  statusFilter,
  userSettings,
  onClearResumeUpload,
  onClearSavedResume,
  onConnectDrive,
  onDelete,
  onNew,
  onSave,
  onSearch,
  onSelect,
  onSetForm,
  onSetResumeUpload,
  onSetResumeUploadName,
  onStatusFilter
}: {
  activeApplication: ApplicationRecord | undefined;
  applications: ApplicationRecord[];
  driveConnected: boolean;
  form: ApplicationFormState;
  isConnectingDrive: boolean;
  isSaving: boolean;
  resumeUpload: File | null;
  resumeUploadName: string;
  search: string;
  statusFilter: "All" | ApplicationStatus;
  userSettings: UserSettings | null;
  onClearResumeUpload: () => void;
  onClearSavedResume: () => void;
  onConnectDrive: () => void;
  onDelete: (application: ApplicationRecord) => void;
  onNew: () => void;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
  onSearch: (value: string) => void;
  onSelect: (application: ApplicationRecord) => void;
  onSetForm: React.Dispatch<React.SetStateAction<ApplicationFormState>>;
  onSetResumeUpload: (file: File) => void;
  onSetResumeUploadName: (value: string) => void;
  onStatusFilter: (value: "All" | ApplicationStatus) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.25fr)]">
      <Panel title="Applications" eyebrow="Records">
        <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_170px]">
          <label className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              size={18}
              aria-hidden="true"
            />
            <span className="sr-only">Search applications</span>
            <input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search company, role, recruiter"
              className={inputClass("pl-10")}
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) => onStatusFilter(event.target.value as "All" | ApplicationStatus)}
            className={selectClass()}
          >
            <option value="All">All statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="grid max-h-[720px] gap-3 overflow-auto pr-1">
          {applications.length ? (
            applications.map((application) => (
              <button
                key={application.id}
                type="button"
                onClick={() => onSelect(application)}
                className={`rounded-lg border p-4 text-left transition ${
                  activeApplication?.id === application.id
                    ? "border-[#2cd6c2]/70 bg-[#2cd6c2]/10"
                    : "border-white/10 bg-[#061012]/65 hover:border-cyan-200/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-white">{application.company}</h3>
                    <p className="mt-1 truncate text-sm text-slate-400">{application.role}</p>
                  </div>
                  <StatusChip status={normalizeStatus(application.status)} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                  {application.dateApplied ? <span>{application.dateApplied}</span> : null}
                  {application.resumeDriveLink ? <span>Resume linked</span> : null}
                </div>
              </button>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-white/10 p-6 text-sm text-slate-400">
              No applications match this view.
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title={activeApplication ? "Edit application" : "New application"}
        eyebrow="Application"
        action={
          activeApplication ? (
            <button
              type="button"
              onClick={() => onDelete(activeApplication)}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-rose-300/30 px-3 text-sm font-medium text-rose-100 hover:bg-rose-300/10"
            >
              <Trash2 size={17} aria-hidden="true" />
              Delete
            </button>
          ) : null
        }
      >
        <form onSubmit={onSave} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Company"
              value={form.company}
              required
              onChange={(company) => onSetForm((current) => ({ ...current, company }))}
            />
            <TextInput
              label="Role"
              value={form.role}
              required
              onChange={(role) => onSetForm((current) => ({ ...current, role }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-200">Status</span>
              <select
                value={form.status}
                onChange={(event) =>
                  onSetForm((current) => ({
                    ...current,
                    status: event.target.value as ApplicationStatus
                  }))
                }
                className={selectClass("mt-2")}
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
              onChange={(dateApplied) => onSetForm((current) => ({ ...current, dateApplied }))}
            />
            <TextInput
              label="Follow-up"
              type="date"
              value={form.followUpDate}
              onChange={(followUpDate) => onSetForm((current) => ({ ...current, followUpDate }))}
            />
          </div>

          <TextInput
            label="Job URL"
            type="url"
            value={form.jobUrl}
            onChange={(jobUrl) => onSetForm((current) => ({ ...current, jobUrl }))}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <TextInput
              label="Recruiter"
              value={form.recruiterName}
              onChange={(recruiterName) => onSetForm((current) => ({ ...current, recruiterName }))}
            />
            <TextInput
              label="Recruiter email"
              type="email"
              value={form.recruiterEmail}
              onChange={(recruiterEmail) => onSetForm((current) => ({ ...current, recruiterEmail }))}
            />
            <TextInput
              label="Recruiter LinkedIn"
              type="url"
              value={form.recruiterLinkedIn}
              onChange={(recruiterLinkedIn) =>
                onSetForm((current) => ({ ...current, recruiterLinkedIn }))
              }
            />
          </div>

          <ResumeUpload
            company={form.company}
            driveConnected={driveConnected}
            driveLink={form.resumeDriveLink}
            fileName={form.resumeFileName}
            folderName={userSettings?.driveFolderName ?? ""}
            isConnecting={isConnectingDrive}
            pendingFile={resumeUpload}
            pendingFileName={resumeUploadName}
            role={form.role}
            onClearPending={onClearResumeUpload}
            onClearSaved={onClearSavedResume}
            onConnectDrive={onConnectDrive}
            onChooseFile={onSetResumeUpload}
            onRenamePending={onSetResumeUploadName}
          />

          <TextArea
            label="Job description"
            value={form.jobDescription}
            onChange={(jobDescription) => onSetForm((current) => ({ ...current, jobDescription }))}
          />
          <TextArea
            label="Notes"
            value={form.notes}
            rows={4}
            onChange={(notes) => onSetForm((current) => ({ ...current, notes }))}
          />

          <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onNew}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/10 px-4 text-sm font-medium text-slate-200 hover:bg-white/[0.07]"
            >
              <Pencil size={17} aria-hidden="true" />
              Clear
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#2cd6c2] px-4 text-sm font-semibold text-[#041012] hover:bg-[#72efe0] disabled:cursor-not-allowed disabled:opacity-65"
            >
              <Save size={17} aria-hidden="true" />
              {isSaving ? "Saving..." : "Save application"}
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

function TableView({
  applications,
  sortDirection,
  sortKey,
  onOpenApplication,
  onSort
}: {
  applications: ApplicationRecord[];
  sortDirection: SortDirection;
  sortKey: SortKey;
  onOpenApplication: (application: ApplicationRecord) => void;
  onSort: (key: SortKey) => void;
}) {
  const columns: Array<{ key: SortKey; label: string }> = [
    { key: "company", label: "Company" },
    { key: "role", label: "Role" },
    { key: "status", label: "Status" },
    { key: "dateApplied", label: "Applied" },
    { key: "followUpDate", label: "Follow-up" },
    { key: "recruiterName", label: "Recruiter" },
    { key: "resumeFileName", label: "Resume" }
  ];

  return (
    <Panel title="Spreadsheet View" eyebrow="Sortable">
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="border-b border-white/10 px-3 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  <button
                    type="button"
                    onClick={() => onSort(column.key)}
                    className="inline-flex items-center gap-1 hover:text-cyan-100"
                  >
                    {column.label}
                    {sortKey === column.key ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
              ))}
              <th className="border-b border-white/10 px-3 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Links
              </th>
            </tr>
          </thead>
          <tbody>
            {applications.map((application) => (
              <tr key={application.id} className="group">
                <td className="border-b border-white/5 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => onOpenApplication(application)}
                    className="font-semibold text-white hover:text-[#72efe0]"
                  >
                    {application.company || "Untitled"}
                  </button>
                </td>
                <td className="border-b border-white/5 px-3 py-3 text-slate-300">{application.role}</td>
                <td className="border-b border-white/5 px-3 py-3"><StatusChip status={normalizeStatus(application.status)} /></td>
                <td className="border-b border-white/5 px-3 py-3 text-slate-300">{application.dateApplied || "-"}</td>
                <td className="border-b border-white/5 px-3 py-3 text-slate-300">{application.followUpDate || "-"}</td>
                <td className="border-b border-white/5 px-3 py-3 text-slate-300">{application.recruiterName || "-"}</td>
                <td className="max-w-[220px] truncate border-b border-white/5 px-3 py-3 text-slate-300">
                  {application.resumeFileName || "-"}
                </td>
                <td className="border-b border-white/5 px-3 py-3">
                  <div className="flex gap-2">
                    {application.jobUrl ? <IconLink href={application.jobUrl} label="Job" /> : null}
                    {application.resumeDriveLink ? <IconLink href={application.resumeDriveLink} label="Resume" /> : null}
                    {application.recruiterLinkedIn ? <IconLink href={application.recruiterLinkedIn} label="LinkedIn" /> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!applications.length ? (
        <div className="mt-4 rounded-lg border border-dashed border-white/10 p-6 text-sm text-slate-400">
          No applications to show.
        </div>
      ) : null}
    </Panel>
  );
}

function MasterResumesView({
  driveConnected,
  isConnectingDrive,
  isSaving,
  masterNotes,
  masterResumes,
  masterTags,
  masterUpload,
  masterUploadName,
  userSettings,
  onClearUpload,
  onConnectDrive,
  onDelete,
  onNotes,
  onSave,
  onTags,
  onUpload,
  onUploadName
}: {
  driveConnected: boolean;
  isConnectingDrive: boolean;
  isSaving: boolean;
  masterNotes: string;
  masterResumes: MasterResumeRecord[];
  masterTags: string;
  masterUpload: File | null;
  masterUploadName: string;
  userSettings: UserSettings | null;
  onClearUpload: () => void;
  onConnectDrive: () => void;
  onDelete: (resume: MasterResumeRecord) => void;
  onNotes: (value: string) => void;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
  onTags: (value: string) => void;
  onUpload: (file: File) => void;
  onUploadName: (value: string) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="Upload Master Resume" eyebrow="Base files">
        <form onSubmit={onSave} className="grid gap-4">
          <FolderStatus
            driveConnected={driveConnected}
            folderName={userSettings?.driveFolderName ?? ""}
            isConnecting={isConnectingDrive}
            onConnectDrive={onConnectDrive}
          />
          <FileChooser
            buttonLabel="Choose master resume"
            pendingFile={masterUpload}
            pendingFileName={masterUploadName}
            onChoose={(file) => onUpload(file)}
            onClear={onClearUpload}
            onRename={onUploadName}
          />
          <TextInput label="Tags" value={masterTags} onChange={onTags} />
          <TextArea label="Notes" rows={4} value={masterNotes} onChange={onNotes} />
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#2cd6c2] px-4 text-sm font-semibold text-[#041012] hover:bg-[#72efe0] disabled:cursor-not-allowed disabled:opacity-65"
          >
            <FileUp size={17} aria-hidden="true" />
            {isSaving ? "Uploading..." : "Upload master resume"}
          </button>
        </form>
      </Panel>

      <Panel title="Master Resume Library" eyebrow={`${masterResumes.length} files`}>
        <div className="grid gap-3">
          {masterResumes.map((resume) => (
            <article key={resume.id} className="rounded-lg border border-white/10 bg-[#061012]/65 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-white">{resume.name}</h3>
                  {resume.tags ? <p className="mt-1 text-sm text-cyan-100/70">{resume.tags}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(resume)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-300/25 text-rose-100 hover:bg-rose-300/10"
                  aria-label={`Delete ${resume.name}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
              {resume.notes ? <p className="mt-3 text-sm leading-6 text-slate-400">{resume.notes}</p> : null}
              <a
                href={resume.driveLink}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-sm font-medium text-cyan-100 hover:bg-white/[0.07]"
              >
                <ExternalLink size={16} aria-hidden="true" />
                Open in Drive
              </a>
            </article>
          ))}
          {!masterResumes.length ? (
            <div className="rounded-lg border border-dashed border-white/10 p-6 text-sm text-slate-400">
              Add your base resumes here, then tailor copies for each application.
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

function SettingsView({
  driveConnected,
  folderInput,
  isConnectingDrive,
  isSaving,
  userSettings,
  onConnectDrive,
  onCreateFolder,
  onFolderInput,
  onSaveFolder
}: {
  driveConnected: boolean;
  folderInput: string;
  isConnectingDrive: boolean;
  isSaving: boolean;
  userSettings: UserSettings | null;
  onConnectDrive: () => void;
  onCreateFolder: () => void;
  onFolderInput: (value: string) => void;
  onSaveFolder: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="Google Drive Folder" eyebrow="Upload destination">
        <div className="grid gap-4">
          <FolderStatus
            driveConnected={driveConnected}
            folderName={userSettings?.driveFolderName ?? ""}
            isConnecting={isConnectingDrive}
            onConnectDrive={onConnectDrive}
          />
          {userSettings?.driveFolderLink ? (
            <a
              href={userSettings.driveFolderLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 text-sm font-medium text-cyan-100 hover:bg-white/[0.07]"
            >
              <ExternalLink size={16} aria-hidden="true" />
              Open selected folder
            </a>
          ) : null}
          <button
            type="button"
            onClick={onCreateFolder}
            disabled={isSaving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#2cd6c2] px-4 text-sm font-semibold text-[#041012] hover:bg-[#72efe0] disabled:cursor-not-allowed disabled:opacity-65"
          >
            <Folder size={17} aria-hidden="true" />
            {isSaving ? "Saving..." : "Create Resume Application Vault folder"}
          </button>
        </div>
      </Panel>

      <Panel title="Use Existing Folder" eyebrow="Optional">
        <div className="grid gap-3">
          <p className="text-sm leading-6 text-slate-400">
            Paste a Google Drive folder link or folder ID. The app will remember it for future uploads.
          </p>
          <input
            value={folderInput}
            onChange={(event) => onFolderInput(event.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className={inputClass()}
          />
          <button
            type="button"
            onClick={onSaveFolder}
            disabled={isSaving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/10 px-4 text-sm font-semibold text-cyan-100 hover:bg-white/[0.07]"
          >
            <Link size={17} aria-hidden="true" />
            Save folder link
          </button>
        </div>
      </Panel>
    </div>
  );
}

function ResumeUpload({
  company,
  driveConnected,
  driveLink,
  fileName,
  folderName,
  isConnecting,
  pendingFile,
  pendingFileName,
  role,
  onClearPending,
  onClearSaved,
  onConnectDrive,
  onChooseFile,
  onRenamePending
}: {
  company: string;
  driveConnected: boolean;
  driveLink: string;
  fileName: string;
  folderName: string;
  isConnecting: boolean;
  pendingFile: File | null;
  pendingFileName: string;
  role: string;
  onClearPending: () => void;
  onClearSaved: () => void;
  onConnectDrive: () => void;
  onChooseFile: (file: File) => void;
  onRenamePending: (value: string) => void;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#061012]/65 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Application Resume</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Uploads to {folderName || "Google Drive"} and saves the link here.
          </p>
        </div>
        <button
          type="button"
          onClick={onConnectDrive}
          disabled={isConnecting}
          className="inline-flex h-10 items-center justify-center rounded-md border border-white/10 px-3 text-sm font-medium text-cyan-100 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-65"
        >
          {driveConnected ? "Drive connected" : isConnecting ? "Connecting..." : "Connect Drive"}
        </button>
      </div>

      <FileChooser
        buttonLabel="Choose resume"
        pendingFile={pendingFile}
        pendingFileName={pendingFileName}
        placeholderFileName={pendingFile ? buildDriveFileName(pendingFile, company, role) : ""}
        onChoose={onChooseFile}
        onClear={onClearPending}
        onRename={onRenamePending}
      />

      {driveLink ? (
        <div className="mt-3 flex flex-col gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 truncate font-medium text-white">{fileName || "Resume"}</span>
          <div className="flex flex-wrap gap-2">
            <a
              href={driveLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-sm font-medium text-cyan-100 hover:bg-white/[0.07]"
            >
              <ExternalLink size={16} aria-hidden="true" />
              Open
            </a>
            <button
              type="button"
              onClick={onClearSaved}
              className="h-9 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 hover:bg-white/[0.07]"
            >
              Remove link
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FileChooser({
  buttonLabel,
  pendingFile,
  pendingFileName,
  placeholderFileName,
  onChoose,
  onClear,
  onRename
}: {
  buttonLabel: string;
  pendingFile: File | null;
  pendingFileName: string;
  placeholderFileName?: string;
  onChoose: (file: File) => void;
  onClear: () => void;
  onRename: (value: string) => void;
}) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    onChoose(file);
    event.target.value = "";
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-[#2cd6c2] px-3 text-sm font-semibold text-[#041012] hover:bg-[#72efe0]">
          <FileUp size={17} aria-hidden="true" />
          {buttonLabel}
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
            onClick={onClear}
            className="h-10 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 hover:bg-white/[0.07]"
          >
            Clear selected file
          </button>
        ) : null}
      </div>

      {pendingFile ? (
        <div className="mt-3 rounded-md border border-amber-200/20 bg-amber-200/10 px-3 py-3">
          <p className="text-sm text-amber-50">Ready to upload: {pendingFile.name}</p>
          <label className="mt-3 block" htmlFor={`${buttonLabel}-drive-name`}>
            <span className="text-sm font-medium text-slate-200">Name in Google Drive</span>
            <input
              id={`${buttonLabel}-drive-name`}
              value={pendingFileName}
              onChange={(event) => onRename(event.target.value)}
              placeholder={placeholderFileName}
              className={inputClass("mt-2")}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function FolderStatus({
  driveConnected,
  folderName,
  isConnecting,
  onConnectDrive
}: {
  driveConnected: boolean;
  folderName: string;
  isConnecting: boolean;
  onConnectDrive: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#061012]/65 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{folderName || "No Drive folder selected"}</p>
          <p className="mt-1 text-sm text-slate-400">
            {folderName ? "Future uploads use this folder." : "Create or save a folder before uploading resumes."}
          </p>
        </div>
        <button
          type="button"
          onClick={onConnectDrive}
          disabled={isConnecting}
          className="h-10 rounded-md border border-white/10 px-3 text-sm font-medium text-cyan-100 hover:bg-white/[0.07]"
        >
          {driveConnected ? "Drive connected" : isConnecting ? "Connecting..." : "Connect Drive"}
        </button>
      </div>
    </div>
  );
}

function ApplicationMiniList({
  applications,
  empty,
  onOpenApplication
}: {
  applications: ApplicationRecord[];
  empty: string;
  onOpenApplication: (application: ApplicationRecord) => void;
}) {
  if (!applications.length) {
    return <div className="rounded-lg border border-dashed border-white/10 p-6 text-sm text-slate-400">{empty}</div>;
  }

  return (
    <div className="grid gap-2">
      {applications.map((application) => (
        <button
          key={application.id}
          type="button"
          onClick={() => onOpenApplication(application)}
          className="rounded-lg border border-white/10 bg-[#061012]/65 p-3 text-left hover:border-cyan-200/30"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{application.company}</p>
              <p className="mt-1 truncate text-sm text-slate-400">{application.role}</p>
            </div>
            <StatusChip status={normalizeStatus(application.status)} />
          </div>
        </button>
      ))}
    </div>
  );
}

function Panel({
  title,
  eyebrow,
  action,
  children
}: {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-cyan-950/20 backdrop-blur">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/60">{eyebrow}</p>
          ) : null}
          <h2 className="mt-1 text-lg font-semibold text-white">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatusChip({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusTone[status]}`}>
      {status}
    </span>
  );
}

function IconLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-8 items-center gap-1 rounded-md border border-white/10 px-2 text-xs font-medium text-cyan-100 hover:bg-white/[0.07]"
    >
      <ExternalLink size={13} aria-hidden="true" />
      {label}
    </a>
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
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass("mt-2")}
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
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full resize-y rounded-md border border-white/10 bg-[#061012]/80 px-3 py-2 text-sm leading-6 text-slate-100 placeholder:text-slate-600"
      />
    </label>
  );
}

function inputClass(extra = "") {
  return `h-11 w-full rounded-md border border-white/10 bg-[#061012]/80 px-3 text-sm text-slate-100 placeholder:text-slate-600 ${extra}`;
}

function selectClass(extra = "") {
  return `h-11 w-full rounded-md border border-white/10 bg-[#061012]/80 px-3 text-sm text-slate-100 ${extra}`;
}

function normalizeStatus(status: ApplicationRecord["status"]): ApplicationStatus {
  return status === "Saved" ? "To Do" : status;
}

function shouldAutoGhost(application: ApplicationRecord, todayStart: number) {
  const status = normalizeStatus(application.status);

  if (status !== "Applied" && status !== "Recruiter screen") {
    return false;
  }

  const applied = dateValue(application.dateApplied);

  if (!applied) {
    return false;
  }

  return todayStart - applied >= ghostedAfterDays * 24 * 60 * 60 * 1000;
}

function timestampMillis(timestamp: Timestamp | null | undefined) {
  return timestamp?.toMillis ? timestamp.toMillis() : 0;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function dateValue(date: string) {
  const time = new Date(`${date}T00:00:00`).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function calculateMetrics(applications: ApplicationRecord[]) {
  const todayStart = startOfToday();
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;
  const statusCounts = statusOptions.reduce(
    (accumulator, status) => ({ ...accumulator, [status]: 0 }),
    {} as Record<ApplicationStatus, number>
  );

  for (const application of applications) {
    statusCounts[normalizeStatus(application.status)] += 1;
  }

  const submittedStatuses: ApplicationStatus[] = [
    "Applied",
    "Recruiter screen",
    "Interviewing",
    "Offer",
    "Rejected",
    "Ghosted",
    "Withdrawn"
  ];
  const responseStatuses: ApplicationStatus[] = [
    "Recruiter screen",
    "Interviewing",
    "Offer",
    "Rejected"
  ];
  const interviewStatuses: ApplicationStatus[] = ["Interviewing", "Offer"];
  const activeStatuses: ApplicationStatus[] = ["To Do", "Applied", "Recruiter screen", "Interviewing"];
  const submitted = applications.filter((application) =>
    submittedStatuses.includes(normalizeStatus(application.status))
  ).length;
  const responses = applications.filter((application) =>
    responseStatuses.includes(normalizeStatus(application.status))
  ).length;
  const interviews = applications.filter((application) =>
    interviewStatuses.includes(normalizeStatus(application.status))
  ).length;
  const offers = statusCounts.Offer;
  const rejections = statusCounts.Rejected;
  const appliedDates = applications
    .map((application) => dateValue(application.dateApplied))
    .filter(Boolean);
  const averageDaysSinceApplication = appliedDates.length
    ? Math.round(
        appliedDates.reduce((total, time) => total + Math.max(0, todayStart - time) / 86400000, 0) /
          appliedDates.length
      )
    : 0;
  const thisWeek = applications.filter((application) => {
    const applied = dateValue(application.dateApplied);
    return applied >= weekStart && applied <= todayStart;
  }).length;
  const active = applications.filter((application) =>
    activeStatuses.includes(normalizeStatus(application.status))
  ).length;
  const overdueFollowUps = applications.filter((application) => {
    const followUp = dateValue(application.followUpDate);
    return followUp > 0 && followUp < todayStart && activeStatuses.includes(normalizeStatus(application.status));
  });
  const dueTodayFollowUps = applications.filter((application) => {
    const followUp = dateValue(application.followUpDate);
    return followUp === todayStart && activeStatuses.includes(normalizeStatus(application.status));
  });
  const oldestActive = applications
    .filter((application) => activeStatuses.includes(normalizeStatus(application.status)))
    .sort((left, right) => dateValue(left.dateApplied) - dateValue(right.dateApplied));
  const weekBuckets = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart + index * 86400000);
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    const count = applications.filter((application) => dateValue(application.dateApplied) === dayStart).length;
    return {
      label: day.toLocaleDateString(undefined, { weekday: "short" }),
      count,
      percent: 0
    };
  });
  const maxWeekCount = Math.max(1, ...weekBuckets.map((bucket) => bucket.count));
  const pipelineBreakdown = pipelineStatuses.map((status) => {
    const count = statusCounts[status] ?? 0;

    return {
      status,
      count,
      percent: percent(count, applications.length)
    };
  });

  return {
    active,
    averageDaysSinceApplication,
    dueTodayFollowUps,
    interviewRate: percent(interviews, submitted),
    interviews,
    offerRate: percent(offers, submitted),
    offers,
    oldestActive,
    overdueFollowUps,
    pipelineBreakdown,
    rejections,
    responseRate: percent(responses, submitted),
    statusCounts,
    submitted,
    thisWeek,
    total: applications.length,
    weekBuckets: weekBuckets.map((bucket) => ({
      ...bucket,
      percent: (bucket.count / maxWeekCount) * 100
    }))
  };
}

function percent(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

function tableSortValue(application: ApplicationRecord, sortKey: SortKey) {
  if (sortKey === "status") {
    return normalizeStatus(application.status);
  }

  return String(application[sortKey] ?? "");
}

async function uploadResumeFile({
  accessToken,
  file,
  company,
  role,
  uploadName,
  folderId
}: {
  accessToken: string | null;
  file: File;
  company: string;
  role: string;
  uploadName: string;
  folderId: string;
}) {
  if (!accessToken) {
    throw new Error("Connect Google Drive before uploading a resume.");
  }

  if (!folderId) {
    throw new Error("Choose or create a Google Drive folder in Settings before uploading.");
  }

  return uploadFileToDrive({
    accessToken,
    file,
    folderId,
    uploadName: uploadName.trim() || buildDriveFileName(file, company, role)
  });
}

async function uploadFileToDrive({
  accessToken,
  file,
  folderId,
  uploadName
}: {
  accessToken: string;
  file: File;
  folderId: string;
  uploadName: string;
}): Promise<DriveUploadResult> {
  const metadata = {
    name: uploadName,
    mimeType: file.type || "application/octet-stream",
    parents: [folderId]
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

  return (await response.json()) as DriveUploadResult;
}

async function createFolderInDrive(accessToken: string, name: string): Promise<DriveUploadResult> {
  const response = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder"
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google Drive folder creation failed: ${details}`);
  }

  return (await response.json()) as DriveUploadResult;
}

function buildDriveFileName(file: File, company: string, role: string) {
  const extension = getFileExtension(file.name);
  const dateStamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "");
  const baseName = [company, role, "resume", dateStamp]
    .map((part) => sanitizeDriveNamePart(part))
    .filter(Boolean)
    .join(" - ");

  return `${baseName || "resume"}${extension}`;
}

function getFileExtension(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot >= 0 ? fileName.slice(lastDot) : "";
}

function sanitizeDriveNamePart(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function parseDriveFolderId(value: string) {
  const trimmed = value.trim();
  const folderMatch = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
  const idQueryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);

  return folderMatch?.[1] ?? idQueryMatch?.[1] ?? (trimmed.match(/^[a-zA-Z0-9_-]{10,}$/) ? trimmed : "");
}

function ClockIcon(props: React.ComponentProps<typeof CalendarClock>) {
  return <CalendarClock {...props} />;
}
