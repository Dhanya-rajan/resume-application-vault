import type { Timestamp } from "firebase/firestore";

export const statusOptions = [
  "To Do",
  "Applied",
  "Recruiter screen",
  "Interviewing",
  "Offer",
  "Rejected",
  "Ghosted",
  "Withdrawn"
] as const;

export type ApplicationStatus = (typeof statusOptions)[number];
export type StoredApplicationStatus = ApplicationStatus | "Saved";

export type ApplicationRecord = {
  id: string;
  uid: string;
  company: string;
  role: string;
  jobUrl: string;
  status: StoredApplicationStatus;
  dateApplied: string;
  followUpDate: string;
  recruiterName: string;
  recruiterEmail: string;
  recruiterLinkedIn: string;
  resumeFileName: string;
  resumeDriveLink: string;
  resumeDriveFileId: string;
  jobDescription: string;
  notes: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

export type ApplicationFormState = Omit<
  ApplicationRecord,
  "id" | "uid" | "createdAt" | "updatedAt" | "status"
> & {
  status: ApplicationStatus;
};

export type UserSettings = {
  uid: string;
  driveFolderId: string;
  driveFolderName: string;
  driveFolderLink: string;
  updatedAt: Timestamp | null;
};

export type MasterResumeRecord = {
  id: string;
  uid: string;
  name: string;
  notes: string;
  tags: string;
  driveFileId: string;
  driveLink: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};
