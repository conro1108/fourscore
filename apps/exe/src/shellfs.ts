/**
 * The desk's shell objects: what movable things exist (the games, and any
 * folders the player makes), and where each one is — on the desk, home in the
 * games folder, inside a user folder, or in the rest. One localStorage key,
 * pure logic, no DOM: the windows and icons are somebody else's job.
 *
 * Item ids are namespaced strings — "game:mines", "folder:3", "file:asm.txt"
 * — so the state serializes flat and a container can hold any kind. The
 * games' home container ("games") only ever accepts games; a folder can
 * never be moved into its own subtree; everything else is allowed, including
 * folders in folders and anything at all in the rest.
 *
 * Files are not owned here — C:\ (fs.ts) is the authority on what exists;
 * this module only remembers where the desk keeps each one. A file the disk
 * no longer has simply stops appearing, and a file the disk just gained
 * shows up on the desk, which is what makes the terminal and the windows
 * two doors into the same machine.
 */

export type ShellLoc = "desk" | "games" | "bin" | { folder: string };

export interface ShellFolder {
  id: string; // "folder:<n>"
  name: string;
}

interface ShellState {
  folders: ShellFolder[];
  /** Where each item is. A game absent from here is home in "games". */
  loc: Record<string, ShellLoc>;
  /** Desk coordinates for items whose loc is "desk". */
  pos: Record<string, [number, number]>;
  /** Global move order — containers list their items in this sequence. */
  order: string[];
  nextFolder: number;
}

export interface ShellFs {
  /** Items in a container, in the order they arrived. */
  itemsIn(loc: ShellLoc): string[];
  locOf(id: string): ShellLoc;
  deskPos(id: string): [number, number] | undefined;
  /** Move an item somewhere. False (and no change) if the move is illegal:
      a non-game into "games", or a folder into its own subtree. */
  move(id: string, loc: ShellLoc, pos?: [number, number]): boolean;
  /** With no name, takes the next "New Folder (n)"; a given name must be free. */
  createFolder(x: number, y: number, name?: string): string | null;
  rename(id: string, name: string): void;
  folderName(id: string): string;
  isFolder(id: string): boolean;
  folders(): readonly ShellFolder[];
  /** A renamed disk file keeps its spot: carry the old id's placement over. */
  migrate(from: string, to: string): void;
}

export const gameItemId = (game: string): string => `game:${game}`;
export const gameOf = (id: string): string | null =>
  id.startsWith("game:") ? id.slice(5) : null;
export const fileItemId = (name: string): string => `file:${name}`;
export const fileOf = (id: string): string | null =>
  id.startsWith("file:") ? id.slice(5) : null;

const KEY = "exe.shell";
/** The pre-folders key: games dragged to the desk, positions only. */
const LEGACY_KEY = "exe.deskgames";

const sameLoc = (a: ShellLoc, b: ShellLoc): boolean =>
  typeof a === "string" || typeof b === "string"
    ? a === b
    : a.folder === b.folder;

export function makeShellFs(
  storage: Storage,
  gameIds: readonly string[],
  diskFiles: () => readonly string[] = () => [],
): ShellFs {
  let state: ShellState = { folders: [], loc: {}, pos: {}, order: [], nextFolder: 1 };
  try {
    const raw = storage.getItem(KEY);
    if (raw) state = { ...state, ...(JSON.parse(raw) as ShellState) };
    else {
      // migrate the old desk-games list once; its games keep their spots
      const legacy = storage.getItem(LEGACY_KEY);
      if (legacy)
        for (const g of JSON.parse(legacy) as { id: string; x: number; y: number }[]) {
          const id = gameItemId(g.id);
          state.loc[id] = "desk";
          state.pos[id] = [g.x, g.y];
          state.order.push(id);
        }
    }
  } catch {
    /* a corrupt shell is a fresh desk, not a crash */
  }
  // untouched games still need a place in line: roster order, ahead of
  // anything that has actually been moved
  state.order = [
    ...gameIds.map(gameItemId).filter((id) => !state.order.includes(id)),
    ...state.order,
  ];
  const save = (): void => storage.setItem(KEY, JSON.stringify(state));

  const known = (id: string): boolean => {
    const g = gameOf(id);
    if (g !== null) return gameIds.includes(g);
    const f = fileOf(id);
    if (f !== null) return diskFiles().some((n) => n.toLowerCase() === f.toLowerCase());
    return state.folders.some((x) => x.id === id);
  };
  const locOf = (id: string): ShellLoc => state.loc[id] ?? (gameOf(id) ? "games" : "desk");

  /** True if `loc` is inside folder `id` (or is it) — the nesting-cycle guard. */
  const within = (loc: ShellLoc, id: string): boolean => {
    let cur = loc;
    for (let hops = 0; hops < 100; hops++) {
      if (typeof cur === "string") return false;
      if (cur.folder === id) return true;
      cur = locOf(cur.folder);
    }
    return true; // a chain that deep is already a cycle; refuse
  };

  /** Placed items in move order, then disk files nobody has placed yet. */
  const allIds = (): string[] => [
    ...state.order,
    ...diskFiles()
      .map(fileItemId)
      .filter((id) => !state.order.includes(id)),
  ];

  return {
    itemsIn: (loc) => allIds().filter((id) => known(id) && sameLoc(locOf(id), loc)),
    locOf,
    deskPos: (id) => state.pos[id],
    move(id, loc, pos) {
      if (!known(id)) return false;
      if (loc === "games" && gameOf(id) === null) return false;
      if (state.folders.some((f) => f.id === id) && within(loc, id)) return false;
      state.loc[id] = loc;
      if (loc === "desk" && pos) state.pos[id] = pos;
      state.order = state.order.filter((x) => x !== id);
      state.order.push(id);
      save();
      return true;
    },
    createFolder(x, y, given) {
      let name: string;
      if (given !== undefined) {
        name = given.trim().slice(0, 32);
        if (!name || state.folders.some((f) => f.name.toLowerCase() === name.toLowerCase()))
          return null;
      } else {
        const base = "New Folder";
        name = base;
        for (let n = 2; state.folders.some((f) => f.name === name); n++)
          name = `${base} (${n})`;
      }
      const id = `folder:${state.nextFolder++}`;
      state.folders.push({ id, name });
      state.loc[id] = "desk";
      state.pos[id] = [x, y];
      state.order.push(id);
      save();
      return id;
    },
    rename(id, name) {
      const f = state.folders.find((x) => x.id === id);
      const clean = name.trim().slice(0, 32);
      if (f && clean) {
        f.name = clean;
        save();
      }
    },
    folderName: (id) => state.folders.find((x) => x.id === id)?.name ?? "folder",
    isFolder: (id) => state.folders.some((f) => f.id === id),
    folders: () => state.folders,
    migrate(from, to) {
      if (from === to) return;
      if (state.loc[from]) state.loc[to] = state.loc[from];
      if (state.pos[from]) state.pos[to] = state.pos[from];
      delete state.loc[from];
      delete state.pos[from];
      state.order = state.order.map((x) => (x === from ? to : x));
      save();
    },
  };
}
