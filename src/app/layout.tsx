import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "BID SHIELD · 계약 생존마진 분석",
    template: "%s · BID SHIELD",
  },
  description:
    "입찰·낙찰·계약과 기업 재무를 결합해 저가낙찰의 현금흐름 위험과 안전 금융조건을 설계합니다.",
  applicationName: "BID SHIELD",
  keywords: ["공공조달", "나라장터", "기업금융", "현금흐름", "입찰분석"],
  icons: { icon: "/icon.svg", shortcut: "/icon.svg" },
  openGraph: {
    title: "BID SHIELD",
    description: "수주가 유동성 위기로 바뀌기 전에, 계약의 생존마진을 계산합니다.",
    type: "website",
    locale: "ko_KR",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#111a26",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${GeistSans.variable} ${GeistMono.variable} dark`}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
