/**
 * Where the desk keeps its icons. The disk (fs.ts) is the authority on what
 * exists — the desk renders C:\DESKTOP — so all that's left to remember is
 * the [x,y] each icon was dropped at. One localStorage key, pure logic, no
 * DOM. Keys are lowercased paths (plus ":moves" and ":drive" for the two
 * fixtures that aren't files); an icon with no entry here takes a default
 * seat, which is what makes the boot arrangement an authored thing rather
 * than a stored one.
 */

export interface DeskPos {
  get(path: string): [number, number] | undefined;
  set(path: string, pos: [number, number]): void;
  /** Forget a seat — the item left the desk or the disk. */
  drop(path: string): void;
  /** A renamed item keeps its spot. */
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
    /* corrupt placement is a re-staged desk, not a crash */
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
