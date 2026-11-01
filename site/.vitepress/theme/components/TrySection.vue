<script setup lang="ts">
import { DEMO_ENABLED } from "../demo-bus";
import DemoChat from "./DemoChat.vue";
import PromptExamples from "./PromptExamples.vue";
</script>

<template>
  <section class="nk-section" id="try" aria-labelledby="try-heading">
    <div class="nk-section-head">
      <p class="nk-eyebrow">체험</p>
      <h2 id="try-heading">
        {{ DEMO_ENABLED ? "연결 전에 먼저 물어보기" : "이렇게 물어보세요" }}
      </h2>
      <p>
        <template v-if="DEMO_ENABLED">
          체험판 AI가 MCP 도구로 실제 데이터를 찾아 답해요. 예시를 누르면 입력창에
          들어갑니다.
        </template>
        <template v-else>
          연결한 ChatGPT·Claude에 그대로 입력하면 MCP 도구가 실제 데이터를 찾아
          답해요.
        </template>
      </p>
    </div>
    <div class="nk-try" :class="{ 'has-chat': DEMO_ENABLED }">
      <DemoChat />
      <PromptExamples />
    </div>
  </section>
</template>
