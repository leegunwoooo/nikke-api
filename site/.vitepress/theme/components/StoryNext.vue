<script setup lang="ts">
import { onMounted, ref } from "vue";
import { API_BASE as BASE } from "../api-base";

interface NextEntry {
  kind: string;
  title: string;
  required: boolean;
  importance?: string;
  note?: string;
}

const MIN_CHAPTER = -1; // -1 = 아직 시작 안 함
const MAX_CHAPTER = 50;

const chapter = ref<number>(20);
const entries = ref<NextEntry[]>([]);
const failed = ref(false);
const loading = ref(false);
const loadedFor = ref<number | null>(null);

const options = Array.from({ length: MAX_CHAPTER - MIN_CHAPTER + 1 }, (_, i) => {
  const n = MIN_CHAPTER + i;
  return { value: n, label: n < 0 ? "아직 시작 안 함" : `메인 ${n}챕터` };
});

const importanceLabel: Record<string, string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

let reqSeq = 0;
const load = async () => {
  const n = Number(chapter.value);
  if (!Number.isInteger(n) || n < MIN_CHAPTER || n > MAX_CHAPTER) {
    entries.value = [];
    failed.value = true;
    return;
  }
  const seq = ++reqSeq;
  loading.value = true;
  failed.value = false;
  try {
    const res = await fetch(`${BASE}/api/story/next?chapter=${n}&limit=6`);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (!Array.isArray(data?.next)) throw new Error("no next");
    if (seq !== reqSeq) return; // a newer request superseded this one
    entries.value = data.next;
    loadedFor.value = n;
  } catch {
    if (seq !== reqSeq) return;
    entries.value = [];
    failed.value = true;
  } finally {
    if (seq === reqSeq) loading.value = false;
  }
};

const step = (delta: number) => {
  const next = Math.min(MAX_CHAPTER, Math.max(MIN_CHAPTER, chapter.value + delta));
  if (next === chapter.value) return;
  chapter.value = next;
  void load();
};

onMounted(load);
</script>

<template>
  <div class="story-next">
    <div class="story-next-controls">
      <label for="story-next-chapter" class="story-next-label">마지막으로 끝낸 메인 챕터</label>
      <div class="story-next-stepper">
        <button
          type="button"
          class="nk-btn story-next-step"
          aria-label="이전 챕터"
          :disabled="chapter <= MIN_CHAPTER"
          @click="step(-1)"
        >
          −
        </button>
        <select
          id="story-next-chapter"
          v-model.number="chapter"
          class="nk-field story-next-select"
          @change="load"
        >
          <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <button
          type="button"
          class="nk-btn story-next-step"
          aria-label="다음 챕터"
          :disabled="chapter >= MAX_CHAPTER"
          @click="step(1)"
        >
          +
        </button>
      </div>
    </div>

    <div class="story-next-body" :aria-busy="loading ? 'true' : undefined">
      <p v-if="loading" class="story-next-status" role="status">불러오는 중…</p>

      <div v-else-if="failed" class="story-next-fallback">
        <p>지금은 추천을 불러올 수 없어요.</p>
        <button type="button" class="nk-btn nk-btn-sm" @click="load">다시 시도</button>
      </div>

      <template v-else-if="entries.length">
        <p class="story-next-status" role="status">
          {{ loadedFor !== null && loadedFor < 0 ? "처음부터" : `메인 ${loadedFor}챕터 다음` }}에 볼
          스토리예요.
        </p>
        <ol class="story-next-list">
          <li v-for="(e, i) in entries" :key="i">
            <div class="entry-row">
              <span class="entry-title">{{ e.title }}</span>
              <span class="badge" :class="{ optional: !e.required }">
                {{ e.required ? "필수" : "선택" }}
              </span>
              <span v-if="e.importance" class="importance">
                중요도 {{ importanceLabel[e.importance] ?? e.importance }}
              </span>
            </div>
            <p v-if="e.note" class="entry-note">{{ e.note }}</p>
          </li>
        </ol>
      </template>

      <p v-else class="story-next-status">추천할 스토리가 없어요.</p>
    </div>

    <dl class="story-next-legend">
      <div>
        <dt><span class="badge">필수</span></dt>
        <dd>메인 스토리 이해에 필요한 순서</dd>
      </div>
      <div>
        <dt><span class="badge optional">선택</span></dt>
        <dd>건너뛰어도 흐름이 끊기지 않음</dd>
      </div>
    </dl>

    <p class="story-next-credit">
      순서 출처:
      <a href="https://ssissun.github.io/nikke-storyline/" target="_blank" rel="noopener">
        NIKKE 스토리 감상 순서 가이드 (ssissun)
      </a>
    </p>
  </div>
</template>

<style scoped>
.story-next {
  border: 1px solid var(--nk-border);
  border-radius: var(--nk-radius-lg);
  background: var(--nk-surface);
}
.story-next-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--nk-space-2) var(--nk-space-4);
  padding: var(--nk-space-4);
  border-bottom: 1px solid var(--nk-border);
}
.story-next-label {
  font-size: var(--nk-text-sm);
  font-weight: 600;
}
.story-next-stepper {
  display: flex;
  align-items: stretch;
}
.story-next-step {
  width: var(--nk-control-h);
  padding: 0;
  font-size: var(--nk-text-lg);
  font-weight: 400;
}
.story-next-step:first-child {
  border-radius: var(--nk-radius-sm) 0 0 var(--nk-radius-sm);
}
.story-next-step:last-child {
  border-radius: 0 var(--nk-radius-sm) var(--nk-radius-sm) 0;
}
.story-next-select {
  min-width: 150px;
  margin: 0 -1px;
  border-radius: 0;
  position: relative;
  z-index: 1;
}
.story-next-body {
  padding: var(--nk-space-4);
  min-height: 120px;
}
.story-next-status {
  margin: 0 0 var(--nk-space-3);
  font-size: var(--nk-text-sm);
  color: var(--nk-text-muted);
}
.story-next-fallback {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--nk-space-3);
}
.story-next-fallback p {
  margin: 0;
  font-size: var(--nk-text-sm);
  color: var(--nk-text-muted);
}
.story-next-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--nk-space-3);
  counter-reset: next;
}
.story-next-list li {
  position: relative;
  margin: 0;
  padding-left: 28px;
  counter-increment: next;
}
.story-next-list li::before {
  content: counter(next);
  position: absolute;
  left: 0;
  top: 1px;
  width: 20px;
  font-family: var(--nk-font-mono);
  font-size: var(--nk-text-xs);
  font-weight: 600;
  color: var(--nk-text-muted);
  text-align: right;
}
.entry-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--nk-space-2);
}
.entry-title {
  font-size: var(--nk-text-sm);
  font-weight: 600;
}
.badge {
  display: inline-block;
  padding: 1px 7px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--nk-accent-soft);
  color: var(--nk-accent);
  font-size: var(--nk-text-xs);
  font-weight: 600;
  line-height: 1.5;
}
.badge.optional {
  background: transparent;
  color: var(--nk-text-muted);
  border-color: var(--nk-border-strong);
}
.importance {
  font-size: var(--nk-text-xs);
  color: var(--nk-text-muted);
}
.entry-note {
  margin: var(--nk-space-1) 0 0;
  font-size: var(--nk-text-xs);
  line-height: 1.5;
  color: var(--nk-text-muted);
}
.story-next-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nk-space-2) var(--nk-space-5);
  margin: 0;
  padding: var(--nk-space-3) var(--nk-space-4);
  border-top: 1px solid var(--nk-border);
}
.story-next-legend > div {
  display: flex;
  align-items: center;
  gap: var(--nk-space-2);
}
.story-next-legend dt,
.story-next-legend dd {
  margin: 0;
}
.story-next-legend dd {
  font-size: var(--nk-text-xs);
  color: var(--nk-text-muted);
}
.story-next-credit {
  margin: 0;
  padding: 0 var(--nk-space-4) var(--nk-space-3);
  font-size: var(--nk-text-xs);
  color: var(--nk-text-muted);
}
</style>
