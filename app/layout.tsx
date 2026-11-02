import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import "./globals.css";

const sentient = localFont({
  src: [
    { path: "./fonts/Sentient-Light.woff2", weight: "300" },
    { path: "./fonts/Sentient-Regular.woff2", weight: "400" },
    { path: "./fonts/Sentient-Italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/Sentient-Medium.woff2", weight: "500" },
  ],
  variable: "--font-sentient",
});

export const metadata: Metadata = {
  title: "Mirette",
  description: "Try on makeup, find the creators closest to your face, and compare prices across sellers.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0a08",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={sentient.variable}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
