import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import McpUrl from "./components/McpUrl.vue";
import McpUrlInline from "./components/McpUrlInline.vue";
import ApiHost from "./components/ApiHost.vue";
import ApiUrl from "./components/ApiUrl.vue";
import LiveStats from "./components/LiveStats.vue";
import ApiReference from "./components/ApiReference.vue";
import StoryNext from "./components/StoryNext.vue";
import DemoChat from "./components/DemoChat.vue";
import PromptExamples from "./components/PromptExamples.vue";
import TrySection from "./components/TrySection.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("McpUrl", McpUrl);
    app.component("McpUrlInline", McpUrlInline);
    app.component("ApiHost", ApiHost);
    app.component("ApiUrl", ApiUrl);
    app.component("LiveStats", LiveStats);
    app.component("ApiReference", ApiReference);
    app.component("StoryNext", StoryNext);
    app.component("DemoChat", DemoChat);
    app.component("PromptExamples", PromptExamples);
    app.component("TrySection", TrySection);
  },
} satisfies Theme;
