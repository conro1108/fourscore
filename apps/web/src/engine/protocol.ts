/** Messages between the UI and the search worker. */

import type { BotDecision, Player, Review } from "@fourscore/engine";

export interface DecideRequest {
  type: "decide";
  id: number;
  botId: string;
  /** The game so far. The worker rebuilds the position from it. */
  history: number[];
}

export interface ReviewRequest {
  type: "review";
  id: number;
  history: number[];
  forPlayer?: Player;
}

/** Drop a bot's accumulated search table when its match ends. */
export interface ResetRequest {
  type: "reset";
  id: number;
  botId: string;
}

export type Request = DecideRequest | ReviewRequest | ResetRequest;

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

export interface ResetResponse {
  type: "reset";
  id: number;
}

export interface ErrorResponse {
  type: "error";
  id: number;
  message: string;
}

export type Response = DecideResponse | ReviewResponse | ResetResponse | ErrorResponse;
