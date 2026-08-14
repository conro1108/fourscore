/**
 * Promise wrapper around the search worker — fever's client, ported.
 *
 * One worker for gameplay, one for anything watching the game (the fever
 * director's eval feed): a message queue is FIFO, so an eval posted while the
 * Oracle is mid-solve would wait out the whole exact search and the desktop
 * would freeze at precisely the moment the fever is supposed to build.
 */

import type { BotDecision, Player, Review, ScoreSource } from "@fourscore/engine";
import type {
  DecideResponse,
  EvaluateResponse,
  Request,
  Response,
  ReviewResponse,
} from "./protocol.js";

type Pending = {
  resolve: (value: never) => void;
  reject: (reason: Error) => void;
};

/**
 * A request minus the id the client assigns. Conditional so it distributes
 * over the union — a plain Omit collapses the request shapes.
 */
type RequestBody = Request extends infer T ? (T extends Request ? Omit<T, "id"> : never) : never;

export class EngineClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<Response>) => {
      const msg = event.data;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.type === "error") entry.reject(new Error(msg.message));
      else entry.resolve(msg as never);
    };
    // Without this a worker that fails to start leaves every request pending
    // forever, and the UI just stops — no error, no move, nothing to debug.
    this.worker.onerror = (event) => {
      const error = new Error(
        `search worker failed: ${"message" in event ? event.message : "unknown"}`,
      );
      for (const [, entry] of this.pending) entry.reject(error);
      this.pending.clear();
    };
  }

  private send<T extends Response>(req: RequestBody): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: never) => void, reject });
      this.worker.postMessage({ ...req, id } as Request);
    });
  }

  async decide(
    botId: string,
    variantId: string,
    history: readonly number[],
  ): Promise<BotDecision> {
    const res = await this.send<DecideResponse>({
      type: "decide",
      botId,
      variantId,
      history: [...history],
    });
    return res.decision;
  }

  async review(
    variantId: string,
    history: readonly number[],
    forPlayer?: Player,
  ): Promise<Review> {
    const res = await this.send<ReviewResponse>({
      type: "review",
      variantId,
      history: [...history],
      forPlayer,
    });
    return res.review;
  }

  async evaluate(
    variantId: string,
    history: readonly number[],
  ): Promise<{ ply: number; advantage: number; source: ScoreSource }> {
    const res = await this.send<EvaluateResponse>({
      type: "evaluate",
      variantId,
      history: [...history],
    });
    return { ply: res.ply, advantage: res.advantage, source: res.source };
  }

  async reset(botId: string, variantId: string): Promise<void> {
    await this.send({ type: "reset", botId, variantId });
  }

  destroy(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}

let shared: EngineClient | null = null;
let analysis: EngineClient | null = null;

/** The gameplay search worker — bot moves, and nothing that can wait. */
export function engineClient(): EngineClient {
  if (!shared) shared = new EngineClient();
  return shared;
}

/** The watcher — the fever director's eval feed, the review later. */
export function analysisClient(): EngineClient {
  if (!analysis) analysis = new EngineClient();
  return analysis;
}
