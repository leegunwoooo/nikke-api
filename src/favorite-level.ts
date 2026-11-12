// Raw favorite-item levels (roledata arrays, max_level, the live
// favorite_item_lv) count from 0. The game shows 애장품 (type Favorite) as
// phases 1–3 and commander dolls (type Collection) as 0–15, so 애장품 add 1.
export const favLevelBase = (type: string | undefined): number => (type === "Favorite" ? 1 : 0);
