import type { Metadata } from "next";
import "./globals.css";

const description = "Secure, human-verified accessibility workflow for visually impaired education teams.";
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

function configuredMetadataBase(): URL {
  try {
    return new URL(configuredSiteUrl || "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: configuredMetadataBase(),
  title: "Braivanta",
  description,
  openGraph: {
    title: "Braivanta",
    description,
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "Braivanta secure accessibility workflow" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Braivanta",
    description,
    images: ["/og.png"],
  },
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
