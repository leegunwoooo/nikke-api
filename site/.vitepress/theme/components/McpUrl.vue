<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { MCP_URL } from "../api-base";
import { copyText } from "../clipboard";

const props = withDefaults(
  defineProps<{
    /** `hero`: labelled, larger; `compact`: smaller, no label. */
    variant?: "hero" | "compact";
  }>(),
  { variant: "hero" }
);

const url = MCP_URL;
const copied = ref(false);
const status = ref("");
let timer: ReturnType<typeof setTimeout> | undefined;

const copy = async () => {
  const ok = await copyText(url);
  if (!ok) {
    status.value = "복사하지 못했어요. 주소를 직접 선택해 복사해 주세요";
    return;
  }
  copied.value = true;
  status.value = "MCP 주소를 복사했어요";
  clearTimeout(timer);
  timer = setTimeout(() => {
    copied.value = false;
    status.value = "";
  }, 2000);
};

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div class="mcp-url" :class="props.variant === 'hero' ? 'is-hero' : 'is-compact'">
    <span v-if="props.variant === 'hero'" id="mcp-url-label" class="mcp-url-label">
      MCP 서버 주소
    </span>
    <div class="mcp-url-row">
      <code :aria-labelledby="props.variant === 'hero' ? 'mcp-url-label' : undefined">{{ url }}</code>
      <button
        type="button"
        class="nk-btn"
        :class="{ 'nk-btn-primary': props.variant === 'hero' }"
        :aria-label="copied ? '복사됨' : 'MCP 주소 복사'"
        @click="copy"
      >
        {{ copied ? "복사됨" : "복사" }}
      </button>
    </div>
    <p v-if="props.variant === 'hero'" class="mcp-url-help">
      인증 없음 · 주소는 반드시 <code class="mcp-url-inline">/mcp</code>로 끝나야 해요
    </p>
    <span class="sr-only" role="status" aria-live="polite">{{ status }}</span>
  </div>
</template>

<style scoped>
.mcp-url-inline {
  display: inline;
  min-height: 0;
  padding: 1px 5px;
  border: 0;
  border-radius: 4px;
  background: var(--nk-surface-2);
  font-size: inherit;
  user-select: text;
}
</style>
