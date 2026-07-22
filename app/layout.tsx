import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "./components/Nav";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Job Pipeline",
  description: "Semi-automated job application pipeline",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <div className="flex min-h-screen">
          <aside className="hidden w-56 shrink-0 border-r border-gray-200 bg-white p-4 md:block">
            <div className="mb-6 px-2">
              <div className="text-lg font-bold tracking-tight">Job Pipeline</div>
              <div className="text-xs text-gray-500">semi-automated</div>
            </div>
            <Nav />
          </aside>
          <main className="flex-1 overflow-x-hidden p-6 md:p-8">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
