<script setup lang="ts">
import { API_BASE } from "../api-base";

const props = withDefaults(defineProps<{ path?: string; method?: string }>(), {
  path: "/api/nikkes",
  method: "GET",
});
const host = API_BASE.replace(/^https?:\/\//, "");
</script>

<template>
  <div class="api-url">
    <span class="api-url-method">{{ props.method }}</span>
    <code><span class="api-url-host">https://{{ host }}</span>{{ props.path }}</code>
  </div>
</template>
