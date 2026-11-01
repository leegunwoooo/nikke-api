<script setup lang="ts">
import { FAQ } from "../../faq";
</script>

<template>
  <dl class="nk-faq">
    <div v-for="item in FAQ" :key="item.q" class="nk-faq-item">
      <dt>{{ item.q }}</dt>
      <dd>{{ item.a }}</dd>
    </div>
  </dl>
</template>
