import type { Timestamp } from "firebase/firestore";

export const statusOptions = [
  "Saved",
  "Applied",
  "Recruiter screen",
  "Interviewing",
  "Offer",
  "Rejected",
  "Withdrawn"
] as const;

export type ApplicationStatus = (typeof statusOptions)[number];

export type ApplicationRecord = {
  id: string;
  uid: string;
  company: string;
  role: string;
  jobUrl: string;
  status: ApplicationStatus;
  dateApplied: string;
  followUpDate: string;
  recruiterName: string;
  recruiterEmail: string;
  recruiterLinkedIn: string;
  jobDescription: string;
  notes: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

export type ApplicationFormState = Omit<
  ApplicationRecord,
  "id" | "uid" | "createdAt" | "updatedAt"
>;
