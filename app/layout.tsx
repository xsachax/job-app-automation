import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "./components/Nav";
import { ThemeProvider, ThemeToggle, themeInitScript } from "./components/ThemeProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Job Pipeline",
  description: "Entry-level software job discovery pipeline",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">
        <ThemeProvider>
          <div className="flex min-h-screen">
            <aside className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white p-4 md:flex dark:border-gray-800 dark:bg-gray-950">
              <div className="mb-6 px-2">
                <div className="text-lg font-bold tracking-tight">Job Pipeline</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">entry-level discovery</div>
              </div>
              <Nav />
              <div className="mt-auto border-t border-gray-100 pt-2 dark:border-gray-800">
                <ThemeToggle />
              </div>
            </aside>
            <main className="flex-1 overflow-x-hidden p-5 md:p-7">
              <div className="mx-auto max-w-7xl">{children}</div>
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
