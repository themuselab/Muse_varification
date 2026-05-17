"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { INDUSTRIES } from "@/app/data/industries";

type GalleryItem = {
  industry: string;
  industryLabel: string;
  templateId: string;
  templateLabel: string;
  imageSrc: string;
};

const FILTERS = [
  { id: "all", label: "전체" },
  ...INDUSTRIES.map((i) => ({ id: i.id, label: i.label })),
];

const SORT_OPTIONS = [
  { id: "popular", label: "인기순" },
  { id: "newest", label: "최신순" },
];

export default function GalleryFilter({ items }: { items: GalleryItem[] }) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("popular");

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.industry === filter);
  }, [items, filter]);

  return (
    <section>
      {/* Category chips */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1 -mx-2 px-2 [-webkit-overflow-scrolling:touch]">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition ${
                active
                  ? "bg-brand text-white shadow-sm shadow-brand/30"
                  : "bg-bg-subtle text-fg hover:bg-bg-hover"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Sort + count */}
      <div className="flex items-center justify-between mb-5">
        <div className="text-sm text-fg-muted">
          <span className="font-semibold text-fg">{filtered.length}</span>개
          템플릿
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="text-sm bg-bg-subtle rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/40"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {filtered.map((item) => (
          <TemplateCard
            key={`${item.industry}-${item.templateId}`}
            item={item}
          />
        ))}
        {/* 맞춤 제작 카드 (항상 마지막) */}
        <CustomRequestCard />
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-fg-muted text-sm">
          이 카테고리에 템플릿이 없어요
        </div>
      )}
    </section>
  );
}

function TemplateCard({ item }: { item: GalleryItem }) {
  return (
    <Link
      href={`/create?industry=${item.industry}&template=${item.templateId}`}
      className="group block relative aspect-square rounded-2xl overflow-hidden bg-bg-subtle shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition duration-200"
    >
      <img
        src={item.imageSrc}
        alt={item.templateLabel}
        className="w-full h-full object-cover transition duration-500 group-hover:scale-[1.05]"
      />

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-brand/0 group-hover:bg-brand/90 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
        <div className="text-center text-white px-4">
          <div className="font-bold text-base mb-1">{item.templateLabel}</div>
          <div className="text-xs opacity-90 mb-3">{item.industryLabel}</div>
          <div className="inline-block px-4 py-2 bg-white text-brand rounded-full text-xs font-bold">
            이 템플릿으로 만들기 →
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-3 py-2.5 group-hover:opacity-0 transition">
        <div className="text-white text-[11px] sm:text-xs font-semibold leading-tight">
          {item.industryLabel}
        </div>
      </div>
    </Link>
  );
}

function CustomRequestCard() {
  return (
    <Link
      href="/create?custom=1"
      className="group block relative aspect-square rounded-2xl overflow-hidden bg-brand-soft border-2 border-dashed border-brand/40 hover:border-brand hover:bg-brand-light/60 transition duration-200 flex flex-col items-center justify-center p-6 text-center"
    >
      <div className="w-12 h-12 rounded-2xl bg-brand/15 flex items-center justify-center mb-3 group-hover:bg-brand group-hover:scale-110 transition">
        <svg
          className="w-6 h-6 text-brand group-hover:text-white transition"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
            d="M12 6v12m6-6H6"
          />
        </svg>
      </div>
      <div className="font-bold text-sm sm:text-base text-fg mb-1.5 leading-tight">
        원하는 디자인이<br />없으세요?
      </div>
      <div className="text-xs text-fg-muted leading-snug mb-3">
        직접 설명 주시면<br />맞춤 제작해드려요
      </div>
      <div className="text-xs font-bold text-brand group-hover:underline">
        맞춤 제작 요청 →
      </div>
    </Link>
  );
}
