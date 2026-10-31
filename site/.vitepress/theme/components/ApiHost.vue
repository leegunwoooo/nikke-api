<script setup lang="ts">
import { API_BASE } from "../api-base";

const host = API_BASE.replace(/^https?:\/\//, "");
</script>

<template>
  <code>{{ host }}</code>
</template>
