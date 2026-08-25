/**
 * Icon [x,y] per desktop item; fs.ts owns what exists. Keys are lowercased
 * paths (plus ":moves" and ":drive" for the non-file fixtures). No entry =
 * default seat, so the boot arrangement stays authored. No DOM.
 */

export interface DeskPos {
  get(path: string): [number, number] | undefined;
  set(path: string, pos: [number, number]): void;
  drop(path: string): void;
  migrate(from: string, to: string): void;
}

const KEY = "exe.desk";

export function makeDeskPos(storage: Pick<Storage, "getItem" | "setItem">): DeskPos {
  let state: Record<string, [number, number]> = {};
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null)
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>))
          if (Array.isArray(v) && typeof v[0] === "number" && typeof v[1] === "number")
            state[k] = [v[0], v[1]];
    }
  } catch {
    /* corrupt = re-staged desk, not a crash */
  }
  const save = (): void => storage.setItem(KEY, JSON.stringify(state));
  const key = (p: string): string => p.toLowerCase();

  return {
    get: (path) => state[key(path)],
    set(path, pos) {
      state[key(path)] = pos;
      save();
    },
    drop(path) {
      if (!(key(path) in state)) return;
      delete state[key(path)];
      save();
    },
    migrate(from, to) {
      const v = state[key(from)];
      if (!v || key(from) === key(to)) return;
      delete state[key(from)];
      state[key(to)] = v;
      save();
    },
  };
}
