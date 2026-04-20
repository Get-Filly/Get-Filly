import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Get-Filly — Meer gasten, minder lege stoelen",
  description:
    "Get-Filly analyseert je bezettingsdata en zet AI in om automatisch campagnes te draaien die je restaurant voller maken.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl" className={inter.variable}>
      <body>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
