export type Industry = {
  id: string;
  label: string;
  icon: string;
  description: string;
};

export const INDUSTRIES: Industry[] = [
  {
    id: "hair",
    label: "헤어샵",
    icon: "✂",
    description: "펌·컬러·매직·미용실",
  },
  {
    id: "brow",
    label: "눈썹/반영구",
    icon: "👁",
    description: "자연눈썹·헤어라인·아이라인",
  },
  {
    id: "nail",
    label: "네일",
    icon: "💅",
    description: "젤네일·아트·페디큐어",
  },
  {
    id: "lash",
    label: "속눈썹",
    icon: "✨",
    description: "연장·펌·리프팅",
  },
  {
    id: "skin",
    label: "피부/마사지",
    icon: "🌿",
    description: "피부관리·마사지·왁싱",
  },
];

export type Template = {
  id: string;
  label: string;
  description: string;
};

export const TEMPLATES: Template[] = [
  { id: "01_full_photo", label: "풀 사진 + 메시지", description: "모델 풀스크린, 큰 헤드라인" },
  { id: "02_after_hero", label: "시술 결과 후크", description: "결과 사진 + 임팩트 카피" },
  { id: "03_offer", label: "할인 광고", description: "30% off 같은 가격 강조" },
  { id: "04_macro", label: "결과 매크로", description: "시술 결과 클로즈업" },
  { id: "05_founder", label: "원장님 스토리", description: "사장님 시술 중 사진" },
  { id: "06_scarcity_dark", label: "프리미엄 다크", description: "하루 N명 한정" },
  { id: "07_question_hook", label: "공감 후크", description: "질문 + 시술 중 사진" },
  { id: "08_new_open", label: "신규 오픈", description: "매장 인테리어 + 오픈일" },
];

// 업종별 가능한 템플릿 (이미지 있는 것만)
export const AVAILABLE_TEMPLATES: Record<string, string[]> = {
  hair: ["01_full_photo", "02_after_hero", "03_offer", "04_macro", "05_founder", "06_scarcity_dark", "07_question_hook", "08_new_open"],
  brow: ["01_full_photo", "02_after_hero", "03_offer", "04_macro", "05_founder", "06_scarcity_dark", "07_question_hook"],
  nail: ["01_full_photo", "02_after_hero", "03_offer", "04_macro", "05_founder", "06_scarcity_dark", "07_question_hook", "08_new_open"],
  lash: ["01_full_photo", "02_after_hero", "03_offer", "04_macro", "05_founder", "06_scarcity_dark"],
  skin: ["01_full_photo", "03_offer", "04_macro", "05_founder"],
};
