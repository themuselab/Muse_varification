"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  INDUSTRIES,
  TEMPLATES,
  AVAILABLE_TEMPLATES,
} from "@/app/data/industries";

// ─── Instagram username 검증 ───
// 규칙: 영문 소문자/숫자/점/언더스코어, 1~30자
//      첫/끝 점 X, 연속 점(..) X
const INSTAGRAM_MAX = 30;

// 한국어 두벌식 자판 → 영문 QWERTY 매핑
// (한영 변환 깜빡한 사장님 자동 보정)
const KOR_TO_EN: Record<string, string> = {
  // 초성/일반 자음
  ㄱ: "r", ㄲ: "R", ㄴ: "s", ㄷ: "e", ㄸ: "E",
  ㄹ: "f", ㅁ: "a", ㅂ: "q", ㅃ: "Q", ㅅ: "t",
  ㅆ: "T", ㅇ: "d", ㅈ: "w", ㅉ: "W", ㅊ: "c",
  ㅋ: "z", ㅌ: "x", ㅍ: "v", ㅎ: "g",
  // 모음
  ㅏ: "k", ㅐ: "o", ㅑ: "i", ㅒ: "O", ㅓ: "j",
  ㅔ: "p", ㅕ: "u", ㅖ: "P", ㅗ: "h", ㅘ: "hk",
  ㅙ: "ho", ㅚ: "hl", ㅛ: "y", ㅜ: "n", ㅝ: "nj",
  ㅞ: "np", ㅟ: "nl", ㅠ: "b", ㅡ: "m", ㅢ: "ml",
  ㅣ: "l",
  // 받침 겹자음
  ㄳ: "rt", ㄵ: "sw", ㄶ: "sg", ㄺ: "fr", ㄻ: "fa",
  ㄼ: "fq", ㄽ: "ft", ㄾ: "fx", ㄿ: "fv", ㅀ: "fg",
  ㅄ: "qt",
};

const INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const MEDIALS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const FINALS = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";

function hangulToEng(input: string): string {
  return Array.from(input)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      // 한글 완성형 (가-힣)
      if (code >= 0xac00 && code <= 0xd7a3) {
        const offset = code - 0xac00;
        const i = Math.floor(offset / 588);
        const m = Math.floor((offset % 588) / 28);
        const f = offset % 28;
        let r = KOR_TO_EN[INITIALS[i]] || "";
        r += KOR_TO_EN[MEDIALS[m]] || "";
        if (f > 0) r += KOR_TO_EN[FINALS[f]] || "";
        return r;
      }
      // 호환 자모 (ㅁ, ㅏ 등 단독)
      if (KOR_TO_EN[ch]) return KOR_TO_EN[ch];
      return ch;
    })
    .join("");
}

function sanitizeInstagram(input: string): string {
  return hangulToEng(input)
    .replace(/^@+/, "")           // @ 제거
    .toLowerCase()                 // 대문자 → 소문자
    .replace(/[^a-z0-9._]/g, "")   // 그 외 특수문자 제거
    .slice(0, INSTAGRAM_MAX);
}

type InstagramValidation =
  | { valid: true }
  | { valid: false; reason: string };

function validateInstagram(handle: string): InstagramValidation {
  if (!handle) return { valid: false, reason: "ID를 입력해주세요" };
  if (handle.length < 1)
    return { valid: false, reason: "1자 이상 입력해주세요" };
  if (handle.length > INSTAGRAM_MAX)
    return { valid: false, reason: `${INSTAGRAM_MAX}자 이하로 입력해주세요` };
  if (!/^[a-z0-9._]+$/.test(handle))
    return {
      valid: false,
      reason: "영문 소문자, 숫자, 점(.), 언더스코어(_)만 가능해요",
    };
  if (handle.startsWith("."))
    return { valid: false, reason: "점(.)으로 시작할 수 없어요" };
  if (handle.endsWith("."))
    return { valid: false, reason: "점(.)으로 끝날 수 없어요" };
  if (handle.includes(".."))
    return { valid: false, reason: "점(..)을 연속으로 쓸 수 없어요" };
  return { valid: true };
}

type FormState = {
  instagram: string;
  industry: string;
  templateId: string;
  shopName: string;
  location: string;
  message: string;
  customRequest: string;
};

type Props = {
  initialIndustry: string;
  initialTemplate: string;
  isCustom?: boolean;
};

export default function CreateForm({
  initialIndustry,
  initialTemplate,
  isCustom = false,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>({
    instagram: "",
    industry: initialIndustry,
    templateId: isCustom ? "custom" : initialTemplate,
    shopName: "",
    location: "",
    message: "",
    customRequest: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // custom 모드일 때는 템플릿 단계가 빠짐
  const totalSteps = isCustom ? 4 : 4;
  const hasPreselect = !!initialIndustry && !!initialTemplate && !isCustom;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function next() {
    setError(null);
    if (step === 1) {
      const v = validateInstagram(form.instagram);
      if (!v.valid) {
        setError(v.reason);
        return;
      }
    }
    if (step === 2 && !form.industry) {
      setError("업종을 선택해주세요");
      return;
    }
    if (!isCustom && step === 3 && !form.templateId) {
      setError("템플릿을 선택해주세요");
      return;
    }
    if (isCustom && step === 3 && !form.customRequest.trim()) {
      setError("어떤 광고 원하시는지 알려주세요");
      return;
    }
    if (hasPreselect && step === 1) {
      setStep(4);
      return;
    }
    setStep((s) => Math.min(s + 1, totalSteps));
  }

  function prev() {
    setError(null);
    if (hasPreselect && step === 4) {
      setStep(1);
      return;
    }
    setStep((s) => Math.max(s - 1, 1));
  }

  async function submit() {
    if (!form.shopName.trim()) {
      setError("가게 이름을 입력해주세요");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, isCustom }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "전송 실패");
      router.push(`/done?code=${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "전송 실패");
      setSubmitting(false);
    }
  }

  const progress =
    hasPreselect && step === 4 ? 100 : (step / totalSteps) * 100;

  return (
    <>
      {/* Progress bar */}
      <div className="bg-bg sticky top-16 z-40">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-between text-xs text-fg-muted">
          <span>
            {hasPreselect && step === 4
              ? "2 / 2"
              : `${step} / ${totalSteps}`}
            {isCustom && (
              <span className="ml-2 px-2 py-0.5 bg-brand-light text-brand rounded-full font-bold">
                맞춤 제작
              </span>
            )}
          </span>
          {step > 1 && (
            <button onClick={prev} className="text-brand hover:underline">
              ← 이전
            </button>
          )}
        </div>
        <div className="h-1 bg-bg-subtle">
          <div
            className="h-full bg-brand transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 sm:py-12">
        {hasPreselect && step === 1 && (
          <PreselectBanner
            industry={form.industry}
            templateId={form.templateId}
          />
        )}

        {step === 1 && (
          <InstagramStep
            value={form.instagram}
            onChange={(v) => update("instagram", v)}
          />
        )}

        {step === 2 && (
          <Step
            title="어떤 업종이세요?"
            sub="업종에 맞춰 톤이 자동으로 달라져요"
          >
            <div className="grid grid-cols-2 gap-3">
              {INDUSTRIES.map((ind) => (
                <button
                  key={ind.id}
                  onClick={() => {
                    update("industry", ind.id);
                    if (!isCustom) update("templateId", "");
                  }}
                  className={`p-5 text-left rounded-2xl border-2 transition ${
                    form.industry === ind.id
                      ? "border-brand bg-brand-light"
                      : "border-border bg-bg-elevated hover:border-brand/50"
                  }`}
                >
                  <div className="text-3xl mb-2">{ind.icon}</div>
                  <div className="font-bold text-base mb-1">{ind.label}</div>
                  <div className="text-xs text-fg-muted leading-snug">
                    {ind.description}
                  </div>
                </button>
              ))}
            </div>
          </Step>
        )}

        {step === 3 && !isCustom && (
          <Step
            title="마음에 드는 템플릿 골라주세요"
            sub="이런 식으로 만들어드릴게요"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(AVAILABLE_TEMPLATES[form.industry] || []).map((tid) => {
                const t = TEMPLATES.find((x) => x.id === tid);
                if (!t) return null;
                const isSelected = form.templateId === tid;
                return (
                  <button
                    key={tid}
                    onClick={() => update("templateId", tid)}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition ${
                      isSelected
                        ? "border-brand ring-2 ring-brand/30"
                        : "border-transparent"
                    }`}
                  >
                    <Image
                      src={`/templates/${form.industry}/${tid}.png`}
                      alt={t.label}
                      fill
                      sizes="(max-width: 640px) 50vw, 33vw"
                      className="object-cover"
                    />
                    <div className="absolute bottom-0 inset-x-0 bg-linear-to-t from-black/80 to-transparent px-3 py-2 text-left">
                      <div className="text-xs font-bold text-white">
                        {t.label}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-brand text-white text-sm flex items-center justify-center font-bold">
                        ✓
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </Step>
        )}

        {step === 3 && isCustom && (
          <Step
            title="어떤 광고 원하세요?"
            sub="자유롭게 설명해주세요. 디자이너가 직접 만들어드려요."
          >
            <div className="space-y-4">
              <Field label="원하는 광고 설명 *">
                <textarea
                  value={form.customRequest}
                  onChange={(e) => update("customRequest", e.target.value)}
                  placeholder={`예시:
- 모델 사진 + 큰 가격 강조 (3만원 첫방문)
- 시술 전후 두 장 비교, 갈색 톤
- 카드뉴스 형식, 7장 슬라이드
- 매장 인테리어 사진 + 오픈 알림

레퍼런스 (참고 이미지) URL이 있다면 적어주세요.`}
                  rows={10}
                  className="w-full px-4 py-3 bg-bg-elevated border border-border rounded-xl focus:outline-none focus:border-brand resize-none text-sm leading-relaxed"
                />
              </Field>
              <div className="bg-brand-light rounded-xl p-4 text-sm leading-relaxed">
                💡 자유롭게 설명해주시면 24시간 안에 디자이너가 만들어
                드려요. 일반 템플릿보다 시간이 좀 더 걸려요.
              </div>
            </div>
          </Step>
        )}

        {step === 4 && (
          <Step title="가게 정보 알려주세요" sub="광고에 들어갈 정보예요">
            <div className="space-y-4">
              <Field label="가게 이름 *">
                <input
                  type="text"
                  value={form.shopName}
                  onChange={(e) => update("shopName", e.target.value)}
                  placeholder="예: 살롱드율, 프롬미 강남본점"
                  className="w-full px-4 py-3 bg-bg-elevated border border-border rounded-xl focus:outline-none focus:border-brand"
                />
              </Field>
              <Field label="위치 (선택)">
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => update("location", e.target.value)}
                  placeholder="예: 강남역 도보 3분"
                  className="w-full px-4 py-3 bg-bg-elevated border border-border rounded-xl focus:outline-none focus:border-brand"
                />
              </Field>
              <Field label="하고 싶은 메시지 (선택)">
                <textarea
                  value={form.message}
                  onChange={(e) => update("message", e.target.value)}
                  placeholder="예: 첫방문 30% 할인, 셋팅펌 전문, 10년차 원장"
                  rows={4}
                  className="w-full px-4 py-3 bg-bg-elevated border border-border rounded-xl focus:outline-none focus:border-brand resize-none"
                />
              </Field>
              <div className="bg-brand-light rounded-xl p-4 text-sm leading-relaxed">
                💡 제출 후 인스타로{" "}
                <strong className="text-brand">@themuselab.official</strong>
                에게 자동으로 신청 메시지가 전송돼요.{" "}
                {isCustom
                  ? "24시간 안에 광고를 받으실 수 있어요."
                  : "30분 안에 광고를 받으실 수 있어요."}
              </div>
            </div>
          </Step>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="mt-8 flex gap-3">
          {step < totalSteps && (
            <button
              onClick={next}
              className="flex-1 px-6 py-3.5 bg-brand text-white rounded-full font-bold hover:bg-brand-strong transition shadow-sm shadow-brand/30"
            >
              다음 →
            </button>
          )}
          {step === totalSteps && (
            <button
              onClick={submit}
              disabled={submitting}
              className="flex-1 px-6 py-3.5 bg-brand text-white rounded-full font-bold hover:bg-brand-strong transition disabled:opacity-50 shadow-sm shadow-brand/30"
            >
              {submitting ? "전송 중..." : "광고 만들기 →"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function PreselectBanner({
  industry,
  templateId,
}: {
  industry: string;
  templateId: string;
}) {
  const ind = INDUSTRIES.find((i) => i.id === industry);
  const tpl = TEMPLATES.find((t) => t.id === templateId);
  if (!ind || !tpl) return null;

  return (
    <div className="mb-6 bg-bg-elevated rounded-2xl p-4 border border-brand-light flex items-center gap-4">
      <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-bg-subtle">
        <Image
          src={`/templates/${industry}/${templateId}.png`}
          alt={tpl.label}
          fill
          sizes="64px"
          className="object-cover"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-brand font-bold mb-0.5">
          ✓ 선택한 템플릿
        </div>
        <div className="font-bold text-sm">{tpl.label}</div>
        <div className="text-xs text-fg-muted">
          {ind.icon} {ind.label}
        </div>
      </div>
    </div>
  );
}

function Step({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-black mb-2 leading-snug tracking-tight">
        {title}
      </h1>
      <p className="text-sm sm:text-base text-fg-muted mb-8 leading-relaxed">
        {sub}
      </p>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-fg-muted mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

function InstagramStep({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [touched, setTouched] = useState(false);
  const validation = validateInstagram(value);
  const showError = touched && !validation.valid && value.length > 0;
  const showOk = touched && validation.valid;

  return (
    <Step
      title="인스타 ID 알려주세요"
      sub="가게 인스타 계정으로 분석해서 광고 만들어드려요"
    >
      <label className="block text-sm font-medium text-fg-muted mb-2">
        인스타그램 핸들 (@ 빼고)
      </label>
      <div className="relative">
        {/* @ 접두사 prefix */}
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-fg-subtle font-medium pointer-events-none select-none">
          @
        </span>
        <input
          type="text"
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setTouched(true);
            onChange(sanitizeInstagram(e.target.value));
          }}
          onBlur={() => setTouched(true)}
          placeholder="your_shop_handle"
          maxLength={INSTAGRAM_MAX}
          className={`w-full pl-10 pr-12 py-3 bg-bg-elevated rounded-xl border-2 transition focus:outline-none ${
            showError
              ? "border-red-500/60 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              : showOk
                ? "border-brand/60 focus:border-brand focus:ring-2 focus:ring-brand/20"
                : "border-border focus:border-brand focus:ring-2 focus:ring-brand/15"
          }`}
          autoFocus
        />
        {/* 우측 상태 아이콘 */}
        {showOk && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-brand">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </span>
        )}
        {showError && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-red-500">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </span>
        )}
      </div>

      {/* 상태 안내 */}
      <div className="mt-2 min-h-6 text-xs">
        {showError && (
          <span className="text-red-600 dark:text-red-400 font-medium">
            ⚠ {(validation as { valid: false; reason: string }).reason}
          </span>
        )}
        {showOk && (
          <span className="text-fg-muted">
            → instagram.com/<span className="text-fg font-medium">{value}</span>
          </span>
        )}
        {!touched && (
          <span className="text-fg-subtle">
            영문 소문자, 숫자, 점(.), 언더스코어(_)만 가능 · 최대 30자
          </span>
        )}
      </div>
    </Step>
  );
}
