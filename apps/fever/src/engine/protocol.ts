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

/**
 * Score one position for the live eval feed, on the same axis the review draws.
 * Cheap by design: this runs once per ply while a game is in progress.
 */
export interface EvaluateRequest {
  type: "evaluate";
  id: number;
  variantId: string;
  /** The game so far. The position scored is the one *after* every move here. */
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
  /** Wall-clock time the search took, so the UI can pace itself. */
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
  /** Plies played in the position scored, so a stale reply can be recognised. */
  ply: number;
  /** Advantage from red's point of view, -1..1 — `advantageOf`'s axis. */
  advantage: number;
  /**
   * Where the number came from. Live play is `estimated` except at a finished
   * game, where the result is a fact rather than a search.
   */
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
