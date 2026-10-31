<script setup lang="ts">
import { onMounted, ref } from "vue";
import { API_BASE as BASE } from "../api-base";

interface Stats {
  version: string;
  syncedAt: string;
  nikkes: number;
  scenes: number;
  events: number;
}

const stats = ref<Stats | null>(null);
const loading = ref(true);

const formatDate = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const get = async (p: string) => {
  const res = await fetch(`${BASE}${p}`);
  if (!res.ok) throw new Error(p);
  return res.json();
};

onMounted(async () => {
  try {
    const [meta, nikkes, scenes, events] = await Promise.all([
      get("/"),
      get("/api/nikkes?limit=1"),
      get("/api/scenes?limit=1"),
      get("/api/events?limit=1"),
    ]);
    stats.value = {
      version: meta.version ?? "?",
      syncedAt: meta.syncedAt ? formatDate(new Date(meta.syncedAt)) : "?",
      nikkes: nikkes.count ?? 0,
      scenes: scenes.count ?? 0,
      events: events.count ?? 0,
    };
  } catch {
    stats.value = null;
  } finally {
    loading.value = false;
  }
});

const placeholder = "—";
</script>

<template>
  <dl
    v-if="loading || stats"
    class="live-stats"
    :aria-busy="loading ? 'true' : undefined"
    aria-label="현재 데이터 규모"
  >
    <div class="stat">
      <dt>캐릭터</dt>
      <dd>{{ stats ? stats.nikkes.toLocaleString() : placeholder }}</dd>
    </div>
    <div class="stat">
      <dt>스토리 씬</dt>
      <dd>{{ stats ? stats.scenes.toLocaleString() : placeholder }}</dd>
    </div>
    <div class="stat">
      <dt>이벤트</dt>
      <dd>{{ stats ? stats.events.toLocaleString() : placeholder }}</dd>
    </div>
    <div class="stat">
      <dt>데이터 기준일</dt>
      <dd>{{ stats ? stats.syncedAt : placeholder }}</dd>
    </div>
    <div class="stat">
      <dt>API 버전</dt>
      <dd>{{ stats ? `v${stats.version}` : placeholder }}</dd>
    </div>
  </dl>
</template>
