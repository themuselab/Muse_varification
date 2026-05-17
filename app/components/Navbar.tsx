import Image from "next/image";
import Link from "next/link";

const NAV_ITEMS = [
  { label: "템플릿", href: "/" },
];

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-6">
        {/* Logo only (no text) */}
        <Link
          href="/"
          aria-label="muse"
          className="shrink-0 inline-flex items-center"
        >
          <Image
            src="/muse_logo_pink.png"
            alt="muse"
            width={36}
            height={36}
            preload
            className="w-9 h-9 transition-transform hover:scale-105"
          />
        </Link>

        {/* Center nav */}
        <nav className="hidden md:flex items-center gap-8">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-sm font-medium text-fg hover:text-brand transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right CTA */}
        <Link
          href="/create"
          className="px-4 sm:px-5 h-9 sm:h-10 inline-flex items-center bg-brand text-white text-sm font-bold rounded-full hover:bg-brand-strong transition shadow-sm shadow-brand/30"
        >
          시작하기
        </Link>
      </div>
    </header>
  );
}
