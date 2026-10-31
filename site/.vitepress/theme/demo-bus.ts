// Tiny shared state between the prompt examples and the demo chat widget.
// Both are build-time gated on VITE_DEMO_URL so they agree on whether the
// chat exists at all.
import { ref } from "vue";

export const DEMO_URL = (import.meta.env.VITE_DEMO_URL as string | undefined) || "";
export const DEMO_ENABLED = DEMO_URL.length > 0;

export interface Draft {
  text: string;
  seq: number;
}

/** Latest example the user picked; `seq` lets the same text fire twice. */
export const draft = ref<Draft | null>(null);

let seq = 0;
export const setDraft = (text: string) => {
  draft.value = { text, seq: ++seq };
};
