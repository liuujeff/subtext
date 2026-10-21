import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, JetBrains_Mono } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";

import "./globals.css";

// The console face: headings, numbers, the input and the sonar's labels.
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const body = Atkinson_Hyperlegible({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Subtext",
  description:
    "Find one word that sits between two others in meaning. Five pairs a day, three guesses each.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E9F1EC" },
    { media: "(prefers-color-scheme: dark)", color: "#020806" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script may set data-theme on <html> before React hydrates it.
    <html lang="en" className={`${mono.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
