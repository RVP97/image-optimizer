import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { TapSlop } from "@/components/tap-slop";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Image optimizer — private, in-browser",
  description:
    "Resize, convert, and compress images locally. WebP, JPEG, PNG. Nothing leaves your device.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-dvh bg-background antialiased`}
      >
        <TapSlop />
        {children}
      </body>
    </html>
  );
}
