import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConsentAndAnalytics } from "@/components/ConsentAndAnalytics";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Debately — AI-assisted debate practice",
  description:
    "Practice debates against AI or a friend with fact-checking, scoring, and an automated judge.",
};

// `interactive-widget=resizes-content` makes the visual viewport shrink when
// the on-screen keyboard opens, so a bottom-anchored input docks to the top
// of the keyboard instead of being pushed off-screen.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-x-hidden antialiased`}
    >
      <body className="flex min-h-dvh flex-col overflow-x-hidden bg-zinc-950 text-zinc-100">
        {children}
        <ConsentAndAnalytics />
      </body>
    </html>
  );
}
