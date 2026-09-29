export type Locale = "ko" | "en" | "ja" | "zh-TW";
export type Burst = "I" | "II" | "III" | "All";

export interface RawNikke {
  id: number;
  resource_id: number;
  order: number;
  original_rare: "R" | "SR" | "SSR";
  class: "Attacker" | "Defender" | "Supporter";
  use_burst_skill: "Step1" | "Step2" | "Step3" | "AllStep";
  name_code: number;
  grade_core_id: number;
  corporation: string;
  is_visible: boolean;
  name_localkey?: { name: string };
  element_id?: {
    element?: {
      id: number;
      element: string;
      element_icon?: string;
    };
  };
  shot_id?: {
    element?: {
      ammo?: number;
      weapon_type?: string;
      attack_type?: string;
    };
  };
  costumes?: { id: number; costume_index: number }[];
}

export interface ImageSet {
  icon: string;
  medium: string;
  full: string;
}

export interface Nikke {
  id: number;
  resourceId: number;
  name: Partial<Record<Locale, string>>;
  rarity: string;
  class: string;
  burst: Burst;
  corporation: string;
  element: string | null;
  weapon: { type: string | null; attackType: string | null; ammo: number | null };
  costumes: {
    id: number;
    skinIndex: number;
    images: ImageSet;
    name?: Localized<string>;
    description?: Localized<string>;
    grade?: string;
    shopType?: string;
  }[];
  images: ImageSet;
  icons: { grade: string; class: string; element?: string };
  skillIcons: { skill1?: string; skill2?: string; burst?: string };
}

export interface SkillIconMap {
  resource_id: number;
  skill1_icon?: string;
  skill2_icon?: string;
  ulti_skill_icon?: string;
}

// --- roledata (per-character detail, one file per resource_id × locale) ---

export interface RawSkillDetail {
  id?: number;
  group_id?: number;
  skill_level?: number;
  icon?: string;
  name_localkey?: string;
  description_localkey?: string;
  info_description_localkey?: string;
  description_value_list?: { description_value?: string[] }[];
  skill_cooltime?: number;
  skill_cooltime_list?: number[];
}

export interface RawSquadDetail {
  id?: number;
  squad?: string;
  squad_name?: string;
  squad_description?: string;
  resource_id?: string;
}

export interface RawRoleData {
  id: number;
  resource_id: number;
  name_localkey?: string;
  description_localkey?: string;
  original_rare?: string;
  class?: string;
  use_burst_skill?: string;
  change_burst_step?: string;
  burst_apply_delay?: number;
  burst_duration?: number;
  critical_ratio?: number;
  critical_damage?: number;
  bonusrange_min?: number;
  bonusrange_max?: number;
  corporation?: string;
  squad?: string;
  squad_detail?: RawSquadDetail;
  cv_localkey?: string;
  cv_localkey_ja?: string;
  cv_localkey_ko?: string;
  cv_localkey_en?: string;
  skill1_detail?: RawSkillDetail;
  skill2_detail?: RawSkillDetail;
  ulti_skill_detail?: RawSkillDetail;
  ulti_skill_id?: number;
  skill1_id?: number;
  skill2_id?: number;
  teammate_list?: Record<string, unknown>;
  attractive_scenario_list?: Record<string, unknown>;
  character_dialog_group_list?: {
    id: number;
    speech_group_id?: number;
    category_group?: number;
    order?: number;
    is_teaser?: boolean;
    voice_description?: string;
    condition_attractive_level?: number;
    speech_id?: string;
    speech_localkey?: string;
  }[];
  character_level_attack_list?: number[];
  character_level_defence_list?: number[];
  character_level_hp_list?: number[];
  character_costume_list?: {
    id: number;
    costume_index: number;
    costume_name_locale?: string;
    costume_description_locale?: string;
    costume_grade_id?: string;
    costume_shop_type?: string;
    is_hidden?: boolean;
  }[];
}

export type Localized<T> = Partial<Record<Locale, T>>;

export interface Skill {
  slot: "skill1" | "skill2" | "burst";
  id?: number;
  icon?: string;
  name: Localized<string>;
  /** raw template with {description_value_NN} placeholders and markup tags */
  descriptionTemplate: Localized<string>;
  /** rendered plain-text description at max level (Lv10), placeholders substituted, markup stripped */
  descriptions: Localized<string>;
  /** burst skill cooldown per level in seconds; undefined for skill1/skill2 */
  cooltime?: number[];
  /** description_value_list: per slot, array of per-level values (index 0 = Lv1) */
  values: (string[] | null)[];
}

export interface NikkeDetail {
  backstory: Localized<string>;
  squad?: {
    id?: number;
    key?: string;
    iconResource?: string;
    name: Localized<string>;
    description: Localized<string>;
  };
  cv: { ko?: string; ja?: string; en?: string };
  combat: {
    /** crit rate, e.g. "15%" */
    criticalRatio?: string;
    /** crit damage, e.g. "150%" */
    criticalDamage?: string;
    /** bonus damage range in % */
    bonusRangeMin?: number;
    bonusRangeMax?: number;
    /** seconds */
    burstApplyDelay?: number;
    burstDuration?: number;
    changeBurstStep?: string;
  };
  skills: Skill[];
  statsPerLevel: { attack?: number[]; defence?: number[]; hp?: number[] };
  teammateList?: unknown;
  attractiveScenarios?: unknown;
  /** character voice lines; audio in ko/en/ja (zh-TW has no dub) */
  voices?: {
    id: number;
    categoryGroup?: number;
    order?: number;
    isTeaser?: boolean;
    conditionAttractiveLevel?: number;
    speechId?: string;
    label: Localized<string>;
    text: Localized<string>;
    voice: { ko?: string; en?: string; ja?: string };
  }[];
}
