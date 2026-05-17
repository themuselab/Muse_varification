import type { Metadata } from "next";
import { Suspense } from "react";
import Navbar from "@/app/components/Navbar";
import CreateForm from "@/app/components/CreateForm";

export const metadata: Metadata = {
  title: "광고 만들기",
  description:
    "인스타 ID와 가게 정보만 알려주세요. 1인 뷰티샵 광고 1장을 신청 순서대로 DM으로 보내드려요.",
  alternates: { canonical: "/create" },
  openGraph: {
    title: "광고 만들기 · Muse",
    description: "인스타 ID + 가게 정보 → 광고 1장 자동",
  },
};

type Props = {
  searchParams: Promise<{
    industry?: string;
    template?: string;
    custom?: string;
  }>;
};

export default async function CreatePage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <main className="min-h-screen bg-bg text-fg">
      <Navbar />
      <Suspense fallback={null}>
        <CreateForm
          initialIndustry={params.industry || ""}
          initialTemplate={params.template || ""}
          isCustom={params.custom === "1"}
        />
      </Suspense>
    </main>
  );
}
