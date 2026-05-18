import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const SITE_URL = "https://themuselab.kr";
const SITE_NAME = "Muse";
const SITE_DESC =
  "1인 뷰티샵 사장님 인스타 광고, DM으로 받으세요. AI가 가게 톤에 맞춘 광고 1장을 만들어 인스타 DM으로 순서대로 보내드려요. 헤어샵·네일·반영구·속눈썹·피부관리 모두.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Muse · 1인 뷰티샵 인스타 광고 DM으로",
    template: "%s · Muse",
  },
  description: SITE_DESC,
  applicationName: SITE_NAME,
  authors: [{ name: "Muse" }],
  generator: "Next.js",
  keywords: [
    "1인샵 광고",
    "뷰티샵 광고",
    "인스타그램 광고",
    "AI 광고 생성",
    "헤어샵 마케팅",
    "네일샵 마케팅",
    "반영구 마케팅",
    "속눈썹 마케팅",
    "피부관리 마케팅",
    "인스타 광고 디자인",
    "캔바 대안",
    "미리캔버스 대안",
    "1인 미용실",
    "동네 뷰티샵",
    "인스타그램 콘텐츠 자동화",
  ],
  referrer: "origin-when-cross-origin",
  creator: "Muse",
  publisher: "Muse",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "1인 뷰티샵 인스타 광고, DM으로 받으세요",
    description: SITE_DESC,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Muse — 1인 뷰티샵 인스타 광고 자동 생성",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "1인 뷰티샵 인스타 광고, DM으로 받으세요",
    description: SITE_DESC,
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
  category: "marketing",
};

export const viewport: Viewport = {
  themeColor: "#F3498D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // JSON-LD 구조화된 데이터
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESC,
    applicationCategory: "DesignApplication",
    operatingSystem: "Any",
    inLanguage: "ko-KR",
    audience: {
      "@type": "BusinessAudience",
      audienceType:
        "1인 뷰티샵 사장님 (헤어샵, 네일샵, 반영구, 속눈썹, 피부관리)",
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "KRW",
    },
  };

  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
