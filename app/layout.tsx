import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "薪時記｜薪資與工時紀錄",
  description: "免費、免登入的薪資計算與工時紀錄工具，支援打卡、加班、津貼與備份。",
  applicationName: "薪時記",
  manifest: "./manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "薪時記",
    statusBarStyle: "black-translucent",
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
