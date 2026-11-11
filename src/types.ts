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

export interface SpineAsset {
  atlas: string;
  skeleton: string;
  texture: string;
}

export interface SpineSet {
  /** standing / lobby animations (idle, idle_02, ...) */
  stand: SpineAsset;
  /** combat aim stance (aim_fire_*, x_aim_skill_*) */
  aim: SpineAsset;
  /** combat cover stance (cover_idle, cover_reload, cover_hit, ...) */
  cover: SpineAsset;
}

export interface BurstPlayback {
  mode: "single" | "composite";
  duration: number;
  /** Back to front. Shared assets, independent skeleton poses, one clock.
   *  transform offsets the layer in skeleton space [x, y, scale] — ArtHub's
   *  composite metadata positions reused-skeleton layers this way. */
  layers: { role: "background" | "main" | "overlay"; animation: string; transform?: [number, number, number] }[];
}

export interface BurstVoiceRef {
  /** Korean line text */
  text?: string;
  /** Korean audio URL */
  audio?: string;
}

export interface BurstCutscene {
  id: string;
  format: "spine";
  spineVersion: string;
  animation: string;
  animations: { name: string; duration: number }[];
  playback: BurstPlayback;
  atlas: string;
  skeleton: string;
  /** Every atlas page, keyed by its original filename (not always one PNG). */
  textures: { name: string; url: string }[];
  viewerUrl: string;
  source: { name: string; url: string; revision: string; viewerUrl: string };
  /**
   * Burst-related voice lines for this skin, from the character's detail file.
   * `burst` is the cutscene line (*_Ult_Skill_N), `ready` the charge line,
   * `full` the full-burst shout. Absent when the detail file wasn't loaded
   * (e.g. list responses); individual slots are null when the skin has none.
   */
  voice?: { burst: BurstVoiceRef | null; ready: BurstVoiceRef | null; full: BurstVoiceRef | null };
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
    spine?: SpineSet;
    burstCutscene?: BurstCutscene | null;
    name?: Localized<string>;
    description?: Localized<string>;
    grade?: string;
    shopType?: string;
  }[];
  images: ImageSet;
  /** spine assets for skinIndex 0 (base appearance) */
  spine?: SpineSet;
  /** Visual burst cutscene for the exact skin; null when not in the catalog. */
  burstCutscene?: BurstCutscene | null;
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
  attractive_scenario_list?: {
    id: number;
    name_code?: number;
    attractive_level?: number;
    scenario_title_locale?: string;
    attractive_scenario_group_id?: string;
    reward_id?: number;
    costume?: number;
  }[];
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
  // voice group -> costume binding (costume_index 0 = base appearance)
  dialog_group_list?: {
    id: number;
    voice_type?: string;
    resource_id?: number;
    costume_index?: number;
  }[];
  shot_detail?: RawShotDetail;
  stat_enhance_id?: number;
  stat_enhance_detail?: RawStatEnhance;
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

// per-character weapon spec (roledata shot_detail) — ids are unique per
// character except a few shared weapons. Times are /100 s, damage-type
// values are /100 %, and burst energies are gauge units (÷10000 → % of
// the full 1,000,000-unit gauge).
export interface RawShotDetail {
  id?: number;
  name_localkey?: string;
  description_localkey?: string;
  weapon_type?: string;
  attack_type?: string;
  counter_enermy?: string;
  prefer_target?: string;
  prefer_target_condition?: string;
  shot_timing?: string;
  fire_type?: string;
  input_type?: string;
  damage?: number;
  shot_count?: number;
  muzzle_count?: number;
  multi_target_count?: number;
  center_shot_count?: number;
  max_ammo?: number;
  maintain_fire_stance?: number;
  fire_timing?: number;
  reload_time?: number;
  reload_bullet?: number;
  reload_start_ammo?: number;
  rate_of_fire_reset_time?: number;
  rate_of_fire?: number;
  end_rate_of_fire?: number;
  rate_of_fire_change_pershot?: number;
  burst_energy_pershot?: number;
  target_burst_energy_pershot?: number;
  spot_first_delay?: number;
  spot_last_delay?: number;
  start_accuracy_circle_scale?: number;
  end_accuracy_circle_scale?: number;
  accuracy_change_pershot?: number;
  accuracy_change_speed?: number;
  auto_start_accuracy_circle_scale?: number;
  auto_end_accuracy_circle_scale?: number;
  auto_accuracy_change_pershot?: number;
  auto_accuracy_change_speed?: number;
  zoom_rate?: number;
  multi_aim_range?: number;
  spot_projectile_speed?: number;
  charge_time?: number;
  full_charge_damage?: number;
  full_charge_burst_energy?: number;
  spot_radius_object?: number;
  spot_radius?: number;
  spot_explosion_range?: number;
  core_damage_rate?: number;
  penetration?: number;
}

// limit-break/core bonus table row (roledata stat_enhance_detail) — ids are
// per rarity band (1xxx R, 3xxx SR, 5xxx SSR) with identical values inside
// each band. Values are raw game units (÷100 → displayed %/stats).
export interface RawStatEnhance {
  id?: number;
  grade_ratio?: number;
  grade_hp?: number;
  grade_attack?: number;
  grade_defence?: number;
  grade_energy_resist?: number;
  grade_metal_resist?: number;
  grade_bio_resist?: number;
  core_hp?: number;
  core_attack?: number;
  core_defence?: number;
  core_energy_resist?: number;
  core_metal_resist?: number;
  core_bio_resist?: number;
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
  /** 호감도 시나리오 — sceneGroupId는 /api/scenes/:groupId의 대본 파일과 1:1 대응 */
  /** 애장품 스토리, read with /api/scenes/:groupId — not in the game data */
  favoriteStory?: { sceneGroupId: string; name: string; sourceVideo: string };
  attractiveScenarios?: {
    id: number;
    sceneGroupId?: string;
    /** 시나리오 해금에 필요한 호감도 레벨 */
    level?: number;
    title: Localized<string>;
    /** 시나리오에서 착용하는 코스튬 tid (없으면 null) */
    costumeTid?: number | null;
    rewardId?: number;
  }[];
  /** character voice lines; audio in ko/en/ja (zh-TW has no dub) */
  voices?: {
    id: number;
    /** 0 = base appearance; >0 = costume-specific lines (costumes[].skinIndex) */
    costumeIndex?: number;
    categoryGroup?: number;
    order?: number;
    isTeaser?: boolean;
    conditionAttractiveLevel?: number;
    speechId?: string;
    label: Localized<string>;
    text: Localized<string>;
    voice: { ko?: string; en?: string; ja?: string };
  }[];
  /** per-character weapon spec from roledata shot_detail */
  shot?: NikkeShot;
  /** limit-break (돌파) and core-enhance (코어) bonus values — raw units */
  statEnhance?: NikkeStatEnhance;
}

export interface NikkeStatEnhance {
  id?: number;
  limitBreak?: {
    ratio?: number;
    hp?: number;
    attack?: number;
    defence?: number;
    energyResist?: number;
    metalResist?: number;
    bioResist?: number;
  };
  core?: {
    hp?: number;
    attack?: number;
    defence?: number;
    energyResist?: number;
    metalResist?: number;
    bioResist?: number;
  };
}

export interface NikkeShot {
  id?: number;
  weaponType?: string;
  attackType?: string;
  counterElement?: string;
  name: Localized<string>;
  /** raw template with {damage}/{charge_time} placeholders */
  descriptionTemplate: Localized<string>;
  /** % of ATK per hit */
  damage?: number;
  shotCount?: number;
  muzzleCount?: number;
  multiTargetCount?: number;
  centerShotCount?: number;
  maxAmmo?: number;
  /** seconds */
  reloadTime?: number;
  reloadBullet?: number;
  reloadStartAmmo?: number;
  /** rounds per minute */
  rateOfFire?: number;
  endRateOfFire?: number;
  rateOfFireChangePershot?: number;
  /** seconds */
  rateOfFireResetTime?: number;
  /** gauge units per hit — ÷10000 → % of burst gauge */
  burstEnergyPershot?: number;
  /** gauge units per hit against the targeted enemy («대상» 기준) */
  targetBurstEnergyPershot?: number;
  /** seconds to full charge */
  chargeTime?: number;
  /** % damage at full charge */
  fullChargeDamage?: number;
  fullChargeBurstEnergy?: number;
  /** % bonus when hitting the core */
  coreDamageRate?: number;
  penetration?: number;
  preferTarget?: string;
  preferTargetCondition?: string;
  shotTiming?: string;
  fireType?: string;
  inputType?: string;
  maintainFireStance?: number;
  fireTiming?: number;
  accuracyCircle?: {
    start?: number;
    end?: number;
    changePershot?: number;
    changeSpeed?: number;
    autoStart?: number;
    autoEnd?: number;
    autoChangePershot?: number;
    autoChangeSpeed?: number;
  };
  zoomRate?: number;
  multiAimRange?: number;
  /** seconds */
  spotFirstDelay?: number;
  /** seconds */
  spotLastDelay?: number;
  spotProjectileSpeed?: number;
  spotRadius?: number;
  spotRadiusObject?: number;
  spotExplosionRange?: number;
}
