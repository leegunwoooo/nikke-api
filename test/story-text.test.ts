import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanDialogueText } from "../scripts/story-text.js";

test("_x000D_ export tokens are removed, newlines kept", () => {
  assert.equal(cleanDialogueText("괜찮아._x000D_\n오명 같은 거"), "괜찮아.\n오명 같은 거");
  // whitespace right before the token goes with it
  assert.equal(cleanDialogueText("괜찮아. _x000D_\n오명"), "괜찮아.\n오명");
  assert.equal(cleanDialogueText("a_x000D_b_x000D_\nc"), "ab\nc");
  assert.equal(cleanDialogueText("없는 대사"), "없는 대사");
});
