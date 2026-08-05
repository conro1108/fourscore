/**
 * Promise wrapper around the search worker.
 *
 * One worker for the whole app, one in-flight request at a time in practice —
 * the game is turn-based, so there's never a reason to have two searches
 * running. Requests are keyed by id anyway so a stale reply from an abandoned
 * match can't be mistaken for the current one.
 */

import type { BotDecision, Player, Review } from "@fourscore/engine";
import type { DecideResponse, Request, Response, ReviewResponse } from "./protocol.js";

type Pending = {
  resolve: (value: never) => void;
  reject: (reason: Error) => void;
};

/**
 * A request minus the id the client assigns.
 *
 * Written as a conditional type so it distributes over the union — a plain
 * `Omit<Request, "id">` collapses the three request shapes into their common
 * fields and then rejects every payload.
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

  async reset(botId: string, variantId: string): Promise<void> {
    await this.send({ type: "reset", botId, variantId });
  }

  destroy(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}

let shared: EngineClient | null = null;

/**
 * The app's one search worker.
 *
 * Deliberately a module singleton rather than something a component owns.
 * Holding it in a `useMemo` and terminating it from an effect cleanup looks
 * tidier and is broken: React 18's StrictMode mounts, unmounts and remounts in
 * development, the cleanup terminates the worker, and `useMemo` does *not*
 * recompute on the remount — so the app comes back up holding a dead worker and
 * every request hangs forever with no error. The worker's real lifetime is the
 * page's, so that's how it's scoped.
 */
export function engineClient(): EngineClient {
  if (!shared) shared = new EngineClient();
  return shared;
}
