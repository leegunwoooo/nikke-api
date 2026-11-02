import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// 애장품 스토리 scripts aren't in the game data, so they live in the repo
// (transcribed from public videos — see content/favorite-stories/README.md).
export interface FavoriteLine {
  id: string;
  speaker?: string;
  speakerName?: string;
  text: string;
  window: string;
  voice: null;
  chosen?: boolean;
}
export interface FavoriteScene {
  groupId: string;
  type: "favorite";
  name: string;
  nikke: string;
  sourceVideo: string;
  lines: FavoriteLine[];
}

export const FAVORITE_DIR = "content/favorite-stories";

export async function readFavoriteStories(dir = path.resolve(FAVORITE_DIR)): Promise<FavoriteScene[]> {
  const files = (await readdir(dir)).filter((f) => /^d_favorite_\w+\.json$/.test(f)).sort();
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(dir, f), "utf8")) as FavoriteScene));
}
