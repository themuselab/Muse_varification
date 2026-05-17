import Image from "next/image";
import Navbar from "@/app/components/Navbar";
import GalleryFilter from "@/app/components/GalleryFilter";
import { INDUSTRIES, TEMPLATES, AVAILABLE_TEMPLATES } from "@/app/data/industries";

type GalleryItem = {
  industry: string;
  industryLabel: string;
  templateId: string;
  templateLabel: string;
  imageSrc: string;
};

function buildAllTemplates(): GalleryItem[] {
  const items: GalleryItem[] = [];
  for (const ind of INDUSTRIES) {
    const templateIds = AVAILABLE_TEMPLATES[ind.id] || [];
    for (const tid of templateIds) {
      const tpl = TEMPLATES.find((t) => t.id === tid);
      if (!tpl) continue;
      items.push({
        industry: ind.id,
        industryLabel: ind.label,
        templateId: tid,
        templateLabel: tpl.label,
        imageSrc: `/templates/${ind.id}/${tid}.png`,
      });
    }
  }
  return items;
}

export default function LandingPage() {
  const all = buildAllTemplates();
  const featured = [
    all.find((i) => i.industry === "hair" && i.templateId === "01_full_photo")!,
    all.find((i) => i.industry === "brow" && i.templateId === "04_macro")!,
    all.find((i) => i.industry === "nail" && i.templateId === "01_full_photo")!,
    all.find((i) => i.industry === "lash" && i.templateId === "04_macro")!,
    all.find((i) => i.industry === "skin" && i.templateId === "01_full_photo")!,
  ].filter(Boolean);

  return (
    <main className="min-h-screen bg-bg text-fg">
      <Navbar />

      {/* Page header */}
      <section className="max-w-7xl mx-auto px-5 sm:px-8 pt-8 sm:pt-12 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
          <div>
            <div className="text-xs text-fg-muted mb-2 tracking-wide">
              템플릿 <span className="mx-1.5">›</span> 1인 뷰티샵
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
              뷰티 광고 템플릿
            </h1>
            <p className="text-sm text-fg-muted mt-1.5">
              사장님 가게 톤에 맞춘 인스타 광고, DM으로.
            </p>
          </div>

          <div className="relative sm:w-72">
            <input
              type="text"
              placeholder="템플릿 검색"
              className="w-full pl-10 pr-4 h-11 bg-bg-subtle rounded-full text-sm placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand/40 focus:bg-bg-elevated transition"
            />
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="7" strokeWidth="2" />
              <path strokeLinecap="round" strokeWidth="2" d="m21 21-4.3-4.3" />
            </svg>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-5 sm:px-8 pb-20">
        {/* Featured row */}
        <section className="mb-14">
          <div className="flex items-center gap-2.5 mb-5">
            <span className="inline-flex items-center px-3 py-1 bg-brand text-white text-xs font-bold rounded-full">
              🔥 지금 인기있는
            </span>
            <span className="text-xs text-fg-muted">업종별 대표</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
            {featured.map((item, idx) => (
              <FeaturedCard
                key={`${item.industry}-${item.templateId}`}
                item={item}
                preload={idx < 2}
              />
            ))}
          </div>
        </section>

        {/* Filter Grid */}
        <GalleryFilter items={all} />
      </div>

      <footer className="py-10 px-6 text-center text-xs text-fg-subtle">
        © 2026 Muse · 1인 뷰티샵 인스타 광고 자동 생성
      </footer>
    </main>
  );
}

function FeaturedCard({
  item,
  preload,
}: {
  item: GalleryItem;
  preload?: boolean;
}) {
  return (
    <a
      href={`/create?industry=${item.industry}&template=${item.templateId}`}
      className="group relative aspect-[4/5] rounded-2xl overflow-hidden bg-bg-subtle shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition"
    >
      <span className="absolute top-3 left-3 z-10 px-2 py-0.5 bg-brand text-white text-[10px] font-bold rounded-full tracking-wider">
        HOT
      </span>
      <Image
        src={item.imageSrc}
        alt={item.templateLabel}
        fill
        sizes="(min-width: 640px) 20vw, 50vw"
        preload={preload}
        className="object-cover transition duration-500 group-hover:scale-110"
      />
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/30 to-transparent px-3 py-3 z-10">
        <div className="text-white text-xs font-bold">
          {item.industryLabel}
        </div>
      </div>
    </a>
  );
}
