import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resume Application Vault",
  description: "Private job application tracker with resume and job description uploads."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
