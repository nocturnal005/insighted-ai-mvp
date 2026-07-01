import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InsightEd AI",
  description:
    "Secure, human-verified accessibility workflow for visually impaired education teams.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="font-sans">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
