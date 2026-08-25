/** Messages between the UI and the search worker. */

import type { BotDecision, Player, Review, ScoreSource } from "@fourscore/engine";

export interface DecideRequest {
  type: "decide";
  id: number;
  botId: string;
  variantId: string;
  /** The game so far. The worker rebuilds the position from it. */
  history: number[];
}

export interface ReviewRequest {
  type: "review";
  id: number;
  variantId: string;
  history: number[];
  forPlayer?: Player;
}

/** Score one position for the live eval feed (review's axis). Runs once per ply, so cheap. */
export interface EvaluateRequest {
  type: "evaluate";
  id: number;
  variantId: string;
  /** Position scored is the one *after* every move here. */
  history: number[];
}

/** Drop a bot's accumulated search table when its match ends. */
export interface ResetRequest {
  type: "reset";
  id: number;
  botId: string;
  variantId: string;
}

export type Request = DecideRequest | ReviewRequest | EvaluateRequest | ResetRequest;

export interface DecideResponse {
  type: "decided";
  id: number;
  decision: BotDecision;
  /** Wall-clock ms the search took, for UI pacing. */
  elapsed: number;
}

export interface ReviewResponse {
  type: "reviewed";
  id: number;
  review: Review;
}

export interface EvaluateResponse {
  type: "evaluated";
  id: number;
  /** Plies in the scored position, to detect stale replies. */
  ply: number;
  /** Advantage from red's point of view, -1..1 — `advantageOf`'s axis. */
  advantage: number;
  /** `estimated` mid-game; `proven` only for a finished game. */
  source: ScoreSource;
}

export interface ResetResponse {
  type: "reset";
  id: number;
}

export interface ErrorResponse {
  type: "error";
  id: number;
  message: string;
}

export type Response =
  | DecideResponse
  | ReviewResponse
  | EvaluateResponse
  | ResetResponse
  | ErrorResponse;
