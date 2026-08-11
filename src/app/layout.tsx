import type { Metadata } from "next";
import "./globals.css";

const description = "Secure, human-verified accessibility workflow for visually impaired education teams.";
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const vercelUrl = process.env.VERCEL_URL?.trim();

function configuredMetadataBase(): URL {
  if (configuredSiteUrl) {
    try {
      return new URL(configuredSiteUrl);
    } catch {
      // Continue to the deployment URL when the configured public URL is invalid.
    }
  }

  if (vercelUrl) {
    try {
      return new URL(`https://${vercelUrl}`);
    } catch {
      // Continue to the local development default when the deployment URL is invalid.
    }
  }

  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: configuredMetadataBase(),
  applicationName: "Braivanta",
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
