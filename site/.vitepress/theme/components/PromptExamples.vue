<script setup lang="ts">
import { DEMO_ENABLED, setDraft } from "../demo-bus";

const examples = [
  { q: "BUNNY X 777 이벤트 스토리 요약해줘", tool: "read_event" },
  { q: "메인 24챕터까지 깼는데 다음에 뭐 봐?", tool: "next_story" },
  { q: "라피랑 홍련 스킬 비교해줘", tool: "compare_nikkes" },
  { q: "아니스가 제일 많이 나오는 이벤트는?", tool: "nikke_appearances" },
  { q: "'방주의 영웅'이라는 대사 나온 장면 찾아줘", tool: "search_lines" },
  { q: "철갑 속성 버스트 3 화력형 니케 알려줘", tool: "search_nikkes" },
];
</script>

<template>
  <div class="prompt-examples">
    <h3 v-if="DEMO_ENABLED">예시 질문</h3>
    <ul class="prompt-list">
      <li v-for="e in examples" :key="e.q">
        <button
          v-if="DEMO_ENABLED"
          type="button"
          class="prompt-item"
          :aria-label="`입력창에 넣기: ${e.q}`"
          @click="setDraft(e.q)"
        >
          <span class="prompt-q">{{ e.q }}</span>
          <span class="prompt-tool" aria-hidden="true">{{ e.tool }}</span>
        </button>
        <div v-else class="prompt-item is-static">
          <span class="prompt-q">{{ e.q }}</span>
          <span class="prompt-tool">{{ e.tool }}</span>
        </div>
      </li>
    </ul>
    <p class="prompt-hint">
      <template v-if="DEMO_ENABLED">
        누르면 입력창에 들어가요. 연결한 ChatGPT·Claude에도 그대로 쓸 수 있어요.
      </template>
      <template v-else>
        작은 글씨는 AI가 뒤에서 호출하는 MCP 도구 이름이에요.
      </template>
    </p>
  </div>
</template>
