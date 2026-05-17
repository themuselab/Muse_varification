import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";

export const metadata: Metadata = {
  title: "신청 완료",
  robots: { index: false, follow: false },
};

type DonePageProps = {
  searchParams: Promise<{ code?: string }>;
};

export default async function DonePage({ searchParams }: DonePageProps) {
  const params = await searchParams;
  const code = params.code || "";
  const message = `신청 ${code}`;
  const instaUrl = `https://www.instagram.com/direct/new/?username=themuselab.official&text=${encodeURIComponent(message)}`;

  return (
    <main className="min-h-screen bg-bg text-fg">
      <Navbar />

      <div className="flex items-center justify-center px-4 py-10 sm:py-16">
        <div className="max-w-xl w-full bg-bg-elevated rounded-3xl p-8 sm:p-10 shadow-xl">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-2xl sm:text-3xl font-black mb-3 leading-snug tracking-tight">
            마지막 한 단계만
            <br />
            남았어요
          </h1>
          <p className="text-fg-muted mb-6 leading-relaxed">
            아래 버튼을 누르면{" "}
            <strong className="text-fg">@themuselab.official</strong>에게
            자동으로 신청 메시지가 전송돼요.
          </p>

          <div className="bg-brand-light rounded-2xl p-5 mb-6">
            <div className="text-xs font-bold text-brand tracking-wider mb-2">
              전송될 메시지
            </div>
            <div className="text-lg font-mono font-bold text-fg">
              신청 {code}
            </div>
          </div>

          <a
            href={instaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center px-6 py-4 bg-linear-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white rounded-full font-bold text-base sm:text-lg hover:opacity-90 transition shadow-lg"
          >
            📨 인스타로 신청 보내기
          </a>

          <div className="mt-6 space-y-2 text-sm text-fg-muted bg-bg-subtle rounded-2xl p-5 leading-relaxed">
            <div className="font-bold text-fg mb-2">전송 후 안내:</div>
            <ul className="space-y-1.5 pl-1">
              <li>✓ 인스타 앱/웹에서 DM 화면이 자동으로 열려요</li>
              <li>✓ &quot;보내기&quot; 한 번만 누르면 끝</li>
              <li>✓ 30분 안에 광고 1장을 DM으로 받으실 수 있어요</li>
              <li>
                💡 알림 잘 받으려면{" "}
                <strong className="text-brand">@themuselab.official</strong>{" "}
                팔로우해주세요
              </li>
            </ul>
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/"
              className="text-sm text-fg-muted hover:text-brand underline"
            >
              처음으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
