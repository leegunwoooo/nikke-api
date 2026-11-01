<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import { useData, withBase } from "vitepress";

const el = ref<HTMLElement>();
const failed = ref(false);
const { isDark } = useData();
type ScalarApi = {
  updateConfiguration?: (c: Record<string, unknown>) => void;
  destroy?: () => void;
};
let api: ScalarApi | null = null;

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(src));
    document.head.appendChild(s);
  });

const config = () => ({
  url: withBase("openapi.json"),
  darkMode: isDark.value,
  forceDarkModeState: isDark.value ? "dark" : "light",
  hideDarkModeToggle: true,
  showDeveloperTools: "never",
  hideClientButton: true,
  agent: { disabled: true },
});

const scalarIsDark = () => {
  const root = el.value;
  const body = document.body;
  const doc = document.documentElement;
  if (body.classList.contains("light-mode") || doc.classList.contains("light-mode"))
    return false;
  if (body.classList.contains("dark-mode") || doc.classList.contains("dark-mode"))
    return true;
  return root?.classList.contains("dark-mode") ?? isDark.value;
};

const create = () => {
  el.value?.replaceChildren();
  api = (window as any).Scalar.createApiReference(el.value, config());
};

onMounted(async () => {
  try {
    if (!(window as any).Scalar) await loadScript(withBase("scalar.js"));
    create();
    watch(isDark, async (dark) => {
      api?.updateConfiguration?.(config());
      await nextTick();
      requestAnimationFrame(() => {
        if (scalarIsDark() !== dark) {
          api?.destroy?.();
          create();
        }
      });
    });
  } catch {
    failed.value = true;
  }
});
</script>

<template>
  <div class="api-reference-embed">
    <p v-if="failed">
      API 레퍼런스를 불러오지 못했습니다.
      <a href="https://github.com/leegunwoooo/nikke-api/blob/main/API.md">API.md</a>를 참고하세요.
    </p>
    <div ref="el"></div>
  </div>
</template>
