<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { DEMO_ENABLED, DEMO_URL, draft } from "../demo-bus";
import { copyText } from "../clipboard";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (t: string) => void }
      ) => string;
      reset: (id: string) => void;
    };
  }
}

const TURNSTILE_SITEKEY = import.meta.env.VITE_TURNSTILE_SITEKEY as
  | string
  | undefined;
const enabled = DEMO_ENABLED;

// request contract — the backend rejects anything beyond these
const MAX_USER_CHARS = 300;
const MAX_HISTORY = 6;
const MAX_ASSISTANT_MSGS = 2;
const MAX_ASSISTANT_CHARS = 600;
const TIMEOUT_MS = 95_000; // backend may reason ~90 s; Cloudflare cuts at 100 s

interface ToolCall {
  name: string;
  args: object;
}
interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  tools?: ToolCall[];
}

const rootEl = ref<HTMLElement | null>(null);
const logEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLTextAreaElement | null>(null);

const messages = ref<ChatMsg[]>([]);
const input = ref("");
const pending = ref(false);
const error = ref("");
const remaining = ref<number | null>(null);
const elapsed = ref(0);
const retryLeft = ref(0);
const copiedIndex = ref<number | null>(null);
const liveText = ref("");

const turnstileToken = ref("");
const turnstileEl = ref<HTMLElement | null>(null);
let turnstileWidgetId: string | null = null;

let elapsedTimer: ReturnType<typeof setInterval> | undefined;
let retryTimer: ReturnType<typeof setInterval> | undefined;
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

const charCount = computed(() => input.value.length);
const atLimit = computed(() => charCount.value >= MAX_USER_CHARS);
const canSend = computed(
  () => !pending.value && retryLeft.value === 0 && input.value.trim().length > 0
);
const errorText = computed(() =>
  retryLeft.value > 0
    ? `요청이 많아요. ${retryLeft.value}초 후에 다시 보낼 수 있어요`
    : error.value
);

const argsSummary = (args: object) => {
  const s = JSON.stringify(args);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
};

const scrollToBottom = async () => {
  await nextTick();
  const el = logEl.value;
  if (el) el.scrollTop = el.scrollHeight;
};
watch(() => messages.value.length, scrollToBottom);
watch(pending, scrollToBottom);

const autoGrow = () => {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
};

const startElapsed = () => {
  elapsed.value = 0;
  clearInterval(elapsedTimer);
  elapsedTimer = setInterval(() => (elapsed.value += 1), 1000);
};
const stopElapsed = () => clearInterval(elapsedTimer);

const startRetry = (seconds: number) => {
  retryLeft.value = Math.max(1, Math.round(seconds));
  clearInterval(retryTimer);
  retryTimer = setInterval(() => {
    retryLeft.value -= 1;
    if (retryLeft.value <= 0) {
      retryLeft.value = 0;
      clearInterval(retryTimer);
    }
  }, 1000);
};

// Last 6 turns; user turns ≤300 chars; at most 2 assistant turns, each ≤600.
const historyForRequest = () => {
  const recent = messages.value.slice(-MAX_HISTORY);
  const out: { role: ChatMsg["role"]; content: string }[] = [];
  let assistants = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (m.role === "assistant") {
      if (assistants >= MAX_ASSISTANT_MSGS) continue;
      assistants++;
      out.unshift({ role: m.role, content: m.content.slice(0, MAX_ASSISTANT_CHARS) });
    } else {
      out.unshift({ role: m.role, content: m.content.slice(0, MAX_USER_CHARS) });
    }
  }
  return out;
};

const focusInput = () => inputEl.value?.focus({ preventScroll: true });

const resetTurnstile = () => {
  if (turnstileWidgetId != null && window.turnstile) {
    window.turnstile.reset(turnstileWidgetId);
    turnstileToken.value = "";
  }
};

const send = async () => {
  const content = input.value.trim().slice(0, MAX_USER_CHARS);
  if (!content || !canSend.value) return;
  error.value = "";
  messages.value.push({ role: "user", content });
  input.value = "";
  await nextTick();
  autoGrow();
  pending.value = true;
  startElapsed();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let failed = false;
  try {
    const body: Record<string, unknown> = { messages: historyForRequest() };
    if (turnstileToken.value) body.turnstileToken = turnstileToken.value;
    const res = await fetch(`${DEMO_URL}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) {
      failed = true;
      startRetry(typeof data?.retryAfter === "number" ? data.retryAfter : 60);
    } else if (res.status === 503) {
      failed = true;
      error.value = "체험이 잠시 꺼져 있어요. 나중에 다시 와 주세요";
    } else if (!res.ok) {
      failed = true;
      error.value =
        typeof data?.error === "string"
          ? data.error
          : "오류가 발생했어요. 다시 시도해 주세요";
    } else {
      const reply = typeof data?.reply === "string" ? data.reply : "";
      messages.value.push({
        role: "assistant",
        content: reply,
        tools: Array.isArray(data?.tools) ? data.tools : [],
      });
      liveText.value = reply ? `AI 답변: ${reply}` : "AI가 빈 답변을 보냈어요";
      if (typeof data?.remainingToday === "number") {
        remaining.value = data.remainingToday;
      }
    }
  } catch {
    failed = true;
    error.value = ctrl.signal.aborted
      ? "95초 안에 답이 오지 않았어요. 질문을 조금 줄여서 다시 시도해 주세요"
      : "연결에 실패했어요. 잠시 후 다시 시도해 주세요";
  } finally {
    clearTimeout(timer);
    stopElapsed();
    pending.value = false;
    resetTurnstile();
    if (failed) {
      // put the question back so it can be re-sent without retyping
      const last = messages.value[messages.value.length - 1];
      if (last?.role === "user" && last.content === content) messages.value.pop();
      if (!input.value) input.value = content;
      await nextTick();
      autoGrow();
    }
    focusInput();
  }
};

const onKeydown = (e: KeyboardEvent) => {
  // Enter sends, Shift+Enter inserts a newline; ignore Enter during IME composition
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    void send();
  }
};

const reset = () => {
  messages.value = [];
  error.value = "";
  input.value = "";
  copiedIndex.value = null;
  liveText.value = "대화를 새로 시작했어요";
  nextTick(autoGrow);
  focusInput();
};

const copyAnswer = async (i: number, text: string) => {
  if (!(await copyText(text))) {
    liveText.value = "복사하지 못했어요";
    return;
  }
  copiedIndex.value = i;
  liveText.value = "답변을 복사했어요";
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copiedIndex.value = null), 2000);
};

// example prompt picked elsewhere on the page → fill the input
watch(draft, async (d) => {
  if (!d) return;
  input.value = d.text.slice(0, MAX_USER_CHARS);
  await nextTick();
  autoGrow();
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  rootEl.value?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  focusInput();
});

onMounted(() => {
  if (!enabled || !TURNSTILE_SITEKEY) return;
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  s.async = true;
  s.defer = true;
  s.onload = () => {
    if (turnstileEl.value && window.turnstile) {
      turnstileWidgetId = window.turnstile.render(turnstileEl.value, {
        sitekey: TURNSTILE_SITEKEY,
        callback: (t: string) => (turnstileToken.value = t),
      });
    }
  };
  document.head.appendChild(s);
});

onBeforeUnmount(() => {
  clearInterval(elapsedTimer);
  clearInterval(retryTimer);
  clearTimeout(copiedTimer);
});
</script>

<template>
  <div v-if="enabled" ref="rootEl" class="demo-chat" role="region" aria-label="AI 체험판">
    <div class="chat-bar">
      <span class="chat-title">체험판 AI</span>
      <span class="chat-meta">DeepSeek · MCP 도구 사용</span>
      <button
        v-if="messages.length || errorText"
        type="button"
        class="nk-btn nk-btn-ghost nk-btn-sm chat-reset"
        @click="reset"
      >
        새 대화
      </button>
    </div>

    <div ref="logEl" class="chat-log" :aria-busy="pending ? 'true' : undefined">
      <p v-if="!messages.length && !pending" class="chat-empty">
        아직 대화가 없어요. 예시 질문을 누르거나 아래에 직접 입력해 보세요.
      </p>
      <article
        v-for="(m, i) in messages"
        :key="i"
        class="chat-msg"
        :class="m.role"
      >
        <span class="chat-role">{{ m.role === "user" ? "나" : "AI" }}</span>
        <p class="chat-text">{{ m.content }}</p>
        <ul v-if="m.tools?.length" class="tool-chips" aria-label="사용한 도구">
          <li v-for="(t, j) in m.tools" :key="j" class="tool-chip" :title="argsSummary(t.args)">
            <code>{{ t.name }}</code>
            <span>{{ argsSummary(t.args) }}</span>
          </li>
        </ul>
        <button
          v-if="m.role === 'assistant' && m.content"
          type="button"
          class="nk-btn nk-btn-ghost nk-btn-sm chat-copy"
          @click="copyAnswer(i, m.content)"
        >
          {{ copiedIndex === i ? "복사됨" : "답변 복사" }}
        </button>
      </article>
      <p v-if="pending" class="chat-pending">
        <span class="chat-dot" aria-hidden="true"></span>
        <span>생각하는 중… {{ elapsed }}초</span>
        <span class="chat-pending-hint">길면 1분 넘게 걸릴 수 있어요</span>
      </p>
    </div>

    <p v-if="errorText" class="chat-error" role="alert">{{ errorText }}</p>

    <form class="chat-form" @submit.prevent="send">
      <label for="demo-chat-input" class="sr-only">질문</label>
      <textarea
        id="demo-chat-input"
        ref="inputEl"
        v-model="input"
        class="nk-field chat-textarea"
        rows="1"
        :maxlength="MAX_USER_CHARS"
        placeholder="질문을 입력하세요"
        aria-describedby="demo-chat-help"
        @keydown="onKeydown"
        @input="autoGrow"
      ></textarea>
      <div class="chat-form-foot">
        <span id="demo-chat-help" class="chat-help">Enter로 보내기 · Shift+Enter 줄바꿈</span>
        <span class="chat-count" :class="{ 'is-full': atLimit }">
          <span class="sr-only">글자 수</span>{{ charCount }}/{{ MAX_USER_CHARS }}
        </span>
        <button type="submit" class="nk-btn nk-btn-primary" :disabled="!canSend">
          {{ pending ? "보내는 중…" : "보내기" }}
        </button>
      </div>
    </form>

    <div v-if="TURNSTILE_SITEKEY" ref="turnstileEl" class="chat-turnstile"></div>

    <p class="chat-notice">
      이용 횟수가 제한돼요 · 입력 내용은 저장하지 않아요
      <span v-if="remaining !== null">· 오늘 남은 횟수 {{ remaining }}회</span>
    </p>
    <div class="sr-only" aria-live="polite">{{ liveText }}</div>
  </div>
</template>

<style scoped>
.demo-chat {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--nk-border);
  border-radius: var(--nk-radius-lg);
  background: var(--nk-surface);
}
.chat-bar {
  display: flex;
  align-items: center;
  gap: var(--nk-space-3);
  padding: var(--nk-space-3) var(--nk-space-4);
  border-bottom: 1px solid var(--nk-border);
}
.chat-title {
  font-size: var(--nk-text-sm);
  font-weight: 600;
}
.chat-meta {
  font-size: var(--nk-text-xs);
  color: var(--nk-text-muted);
}
.chat-reset {
  margin-left: auto;
}
.chat-log {
  display: flex;
  flex-direction: column;
  gap: var(--nk-space-4);
  min-height: 180px;
  max-height: 440px;
  padding: var(--nk-space-4);
  overflow-y: auto;
  scroll-behavior: smooth;
}
.chat-empty {
  margin: auto 0;
  font-size: var(--nk-text-sm);
  color: var(--nk-text-muted);
}
.chat-msg {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--nk-space-1);
  min-width: 0;
}
.chat-role {
  font-size: var(--nk-text-xs);
  font-weight: 600;
  color: var(--nk-text-muted);
}
.chat-msg.user .chat-role {
  color: var(--nk-accent);
}
.chat-text {
  margin: 0;
  max-width: 100%;
  padding: var(--nk-space-2) var(--nk-space-3);
  border-radius: var(--nk-radius);
  font-size: var(--nk-text-sm);
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.chat-msg.user .chat-text {
  background: var(--nk-accent-soft);
}
.chat-msg.assistant .chat-text {
  border: 1px solid var(--nk-border);
  background: var(--nk-bg);
}
.tool-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nk-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
.tool-chip {
  display: inline-flex;
  gap: var(--nk-space-1);
  max-width: 100%;
  margin: 0;
  padding: 2px var(--nk-space-2);
  border: 1px solid var(--nk-border);
  border-radius: var(--nk-radius-sm);
  background: var(--nk-bg);
  font-family: var(--nk-font-mono);
  font-size: var(--nk-text-xs);
  color: var(--nk-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tool-chip code {
  padding: 0;
  background: transparent;
  color: var(--nk-text);
  font-size: inherit;
}
.tool-chip span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat-copy {
  margin-top: var(--nk-space-1);
}
.chat-pending {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--nk-space-2);
  margin: 0;
  font-size: var(--nk-text-sm);
  color: var(--nk-text-muted);
  font-variant-numeric: tabular-nums;
}
.chat-pending-hint {
  font-size: var(--nk-text-xs);
  color: var(--nk-text-faint);
}
.chat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--nk-accent);
  animation: chat-pulse 1.2s ease-in-out infinite;
}
@keyframes chat-pulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}
.chat-error {
  margin: 0;
  padding: var(--nk-space-2) var(--nk-space-4);
  border-top: 1px solid var(--nk-border);
  background: var(--nk-danger-soft);
  font-size: var(--nk-text-sm);
  color: var(--nk-danger);
}
.chat-form {
  padding: var(--nk-space-3) var(--nk-space-4);
  border-top: 1px solid var(--nk-border);
}
.chat-textarea {
  display: block;
  width: 100%;
  min-height: var(--nk-control-h);
  max-height: 160px;
  padding: var(--nk-space-2) var(--nk-space-3);
  resize: none;
  overflow-y: auto;
}
.chat-form-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--nk-space-2) var(--nk-space-3);
  margin-top: var(--nk-space-2);
}
.chat-help {
  font-size: var(--nk-text-xs);
  color: var(--nk-text-faint);
}
.chat-count {
  margin-left: auto;
  font-family: var(--nk-font-mono);
  font-size: var(--nk-text-xs);
  color: var(--nk-text-muted);
  font-variant-numeric: tabular-nums;
}
.chat-count.is-full {
  color: var(--nk-danger);
}
.chat-turnstile {
  padding: 0 var(--nk-space-4);
}
.chat-notice {
  margin: 0;
  padding: var(--nk-space-2) var(--nk-space-4) var(--nk-space-3);
  font-size: var(--nk-text-xs);
  color: var(--nk-text-muted);
}
@media (max-width: 640px) {
  .chat-help {
    display: none;
  }
}
</style>
