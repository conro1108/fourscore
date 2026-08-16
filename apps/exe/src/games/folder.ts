/**
 * The games roster: which games exist, their icons, their labels. The window
 * that shows them is containers.ts — the games folder became one container
 * among several the day the desk grew folders of its own.
 */

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
