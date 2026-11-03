// Excel exports write carriage returns as the literal text "_x000D_" — the
// real line break is the \n after it, so the token and any space before it go
export const cleanDialogueText = (s: string) => s.replace(/[^\S\r\n]*_x000D_/g, "");
