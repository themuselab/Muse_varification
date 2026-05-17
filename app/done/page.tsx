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

const MUSE_HANDLE = "themuselab.official";

export default async function DonePage({ searchParams }: DonePageProps) {
  const params = await searchParams;
  const code = params.code || "";
  const followUrl = `https://www.instagram.com/${MUSE_HANDLE}/`;
  const message = `신청 ${code}`;
  const dmUrl = `https://www.instagram.com/direct/new/?username=${MUSE_HANDLE}&text=${encodeURIComponent(message)}`;

  return (
    <main className="min-h-screen bg-bg text-fg">
      <Navbar />

      <div className="flex items-center justify-center px-4 py-10 sm:py-16">
        <div className="max-w-xl w-full bg-bg-elevated rounded-3xl p-8 sm:p-10 shadow-xl">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-2xl sm:text-3xl font-black mb-3 leading-snug tracking-tight">
            마지막 두 단계만
            <br />
            남았어요
          </h1>

          {/* Why follow first */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4 mb-6 text-sm leading-relaxed text-amber-900 dark:text-amber-100">
            <strong>⚠️ 팔로우하지 않으면 DM이 도착하지 않아요.</strong>
            <br />
            인스타 정책상 팔로우하지 않은 계정의 DM은 <em>메시지 요청</em> 폴더로 숨겨져요.
            완성된 광고를 놓치지 않으려면 먼저 팔로우해주세요.
          </div>

          {/* STEP 1: Follow */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand text-white text-sm font-black">
                1
              </span>
              <span className="font-bold text-fg">
                @{MUSE_HANDLE} 팔로우하기
              </span>
            </div>
            <a
              href={followUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center px-6 py-4 bg-brand text-white rounded-full font-bold text-base sm:text-lg hover:bg-brand-strong transition shadow-lg shadow-brand/30"
            >
              👉 인스타 프로필 열고 팔로우
            </a>
          </div>

          {/* STEP 2: Send code via DM */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-fg text-bg text-sm font-black">
                2
              </span>
              <span className="font-bold text-fg">
                신청 코드를 DM으로 보내기
              </span>
            </div>

            <div className="bg-brand-light rounded-2xl p-5 mb-3">
              <div className="text-xs font-bold text-brand tracking-wider mb-2">
                전송될 메시지
              </div>
              <div className="text-lg font-mono font-bold text-fg">
                신청 {code}
              </div>
            </div>

            <a
              href={dmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center px-6 py-4 bg-linear-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white rounded-full font-bold text-base sm:text-lg hover:opacity-90 transition shadow-lg"
            >
              📨 DM 화면 열고 보내기
            </a>
          </div>

          <div className="space-y-2 text-sm text-fg-muted bg-bg-subtle rounded-2xl p-5 leading-relaxed">
            <div className="font-bold text-fg mb-2">두 단계가 끝나면:</div>
            <ul className="space-y-1.5 pl-1">
              <li>
                ✓ 광고 1장을 <strong className="text-fg">신청 순서대로</strong>{" "}
                DM으로 보내드려요 — 신청이 몰리면 좀 더 걸릴 수 있어요
              </li>
              <li>✓ 받으신 광고를 인스타에 그대로 올리시면 돼요</li>
              <li>✓ 부족한 부분이 있으면 DM으로 알려주세요 — 다시 만들어 드려요</li>
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
