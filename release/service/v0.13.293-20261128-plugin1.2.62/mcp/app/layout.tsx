import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SaySo",
  description: "通过当前 ChatGPT 查看真实 iPhone 画面，并在手机许可下使用 ESP USB HID 执行有界操作。",
  icons: {
    icon: "/sayso-icon.png",
    shortcut: "/sayso-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
