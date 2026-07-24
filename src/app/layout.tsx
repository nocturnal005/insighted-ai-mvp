import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const description = "Secure, human-verified accessibility workflow for visually impaired education teams.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  let metadataBase = new URL("http://localhost:3000");

  try {
    metadataBase = new URL(`${protocol}://${host}`);
  } catch {
    // An invalid Host header must not prevent the application from rendering.
  }

  return {
    metadataBase,
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
}

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
