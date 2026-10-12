import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import Script from "next/script";
import { LAYOUT_BOOT_SCRIPT } from "@/lib/mesa/layout";
import { PALETTE_BOOT_SCRIPT } from "@/lib/mesa/preferences";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "INONU TRADER",
  description: "Central Jev de decisoes e acompanhamento das operacoes.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05080d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        {/* Display preferences (palette, chart mode) are applied by a beforeInteractive script, which runs from the first HTML and before hydration, so a saved choice never flashes the default. A raw script tag here made React warn on the client. */}
        <Script id="inonu-display-preferences" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: PALETTE_BOOT_SCRIPT + LAYOUT_BOOT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
