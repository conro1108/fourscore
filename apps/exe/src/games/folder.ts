/** The games roster: ids, icons, labels. The window showing them is containers.ts. */

import { TITLES } from "../copy.js";
import { GAME_ICON_MINE } from "./mines.js";
import { SOL_ICON } from "./sol.js";
import { SNAKE_ICON } from "./snake.js";
import { CHECKERS_ICON } from "./checkers.js";
import { CHESS_ICON } from "./chess.js";

export type GameId = "mines" | "sol" | "snake" | "checkers" | "chess";

export type GameLaunchers = Record<GameId, () => void>;

export const GAME_ITEMS: readonly { id: GameId; rows: readonly string[]; label: string }[] = [
  { id: "mines", rows: GAME_ICON_MINE, label: TITLES.mines },
  { id: "sol", rows: SOL_ICON, label: TITLES.sol },
  { id: "snake", rows: SNAKE_ICON, label: TITLES.snake },
  { id: "checkers", rows: CHECKERS_ICON, label: TITLES.checkers },
  { id: "chess", rows: CHESS_ICON, label: TITLES.chess },
];
