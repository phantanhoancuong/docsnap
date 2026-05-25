import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import {
  LoadingOverlay,
  ModelLoader,
  ServiceWorkerRegistration,
} from "@/app/components/client";

import { LoadingContextProvider } from "@/app/contexts/LoadingContext";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ededed" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  title: "docsnap",
  description: "Client-side document scanner",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LoadingContextProvider>
          <LoadingOverlay />
          <ServiceWorkerRegistration />
          <ModelLoader />
          {children}
        </LoadingContextProvider>
      </body>
    </html>
  );
}
