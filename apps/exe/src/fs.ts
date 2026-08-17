/**
 * The disk. C:\ is a real place with real directories now: a file saved in
 * Notepad survives the tab closing, COMMAND.COM walks the tree with CD, and
 * the desktop is the directory C:\DESKTOP wearing icons. The whole volume is
 * one localStorage key, because the browser's storage is the only disk this
 * machine has — which keeps the period ratio intact: a few megabytes was a
 * hard drive in 1996, and a few megabytes is what we got.
 *
 * A path is segments joined by backslash ("DESKTOP\readme.txt"); the C:\ is
 * presentation, not storage. Lookup is DOS-cased on the whole path
 * (README.TXT and readme.txt are the same file) but a name keeps the case it
 * was saved with, which is also what the period did.
 *
 * The store is injected so the tests can hand in a plain object; the app
 * makes one disk in main.ts and passes it down. A corrupt volume loads as a
 * fresh one, not a crash — and a fresh volume gets the seed files, so a
 * machine always arrives with its own documentation on it. An old volume is
 * topped up with any seed it is missing (edits to a seed are kept; only its
 * absence is corrected), so documentation the machine grew later still
 * reaches every disk.
 *
 * A volume from before the directories (a bare JSON array) is formatted, not
 * migrated: the flat era's files, desk placement and pins are removed and
 * the machine boots arranged. The one deliberate data loss, version-gated,
 * and it happened when the machine grew a real filesystem.
 */

import { SEED_DIRS, SEED_FILES } from "./copy.js";

export interface FileEntry {
  /** Full path — "DESKTOP\readme.txt". Case as saved. */
  name: string;
  text: string;
}

export interface DiskChange {
  kind: "write" | "remove" | "rename" | "mkdir" | "rmdir";
  name: string;
  /** The new name, for renames. */
  to?: string;
}

export interface Disk {
  /** Every file on the volume, sorted by path. */
  list(): readonly FileEntry[];
  /** One directory's own children. "" is the root. Null if no such dir. */
  listDir(path: string): { dirs: string[]; files: FileEntry[] } | null;
  read(name: string): string | null;
  /** False if a directory already owns the name. Creates missing parents. */
  write(name: string, text: string): boolean;
  /** False if there was no such file. */
  remove(name: string): boolean;
  /** Files and directories both. False if the source is missing, the target
      is taken, or a directory would move into its own subtree. A directory
      rename announces every file it carried, so placement and pins follow. */
  rename(from: string, to: string): boolean;
  exists(name: string): boolean;
  isDir(path: string): boolean;
  /** False if the name is taken (file or dir). Creates missing parents. */
  mkdir(path: string): boolean;
  /** False unless the directory exists and is empty. */
  rmdir(path: string): boolean;
  /** The desk listens: files made in one place appear in the other. */
  onChange(cb: (ev: DiskChange) => void): void;
}

export interface DiskStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = "exe.fs";
/** The flat era's sibling keys — a format takes them along. */
const FORMAT_KEYS = ["exe.fs", "exe.shell", "exe.deskgames", "exe.pins", "exe.untitled", "exe.desk"];

/** Canonical path: backslashes, no drive, no stray slashes or blank segments. */
export const normPath = (p: string): string =>
  p
    .trim()
    .replace(/\//g, "\\")
    .replace(/^[cC]:\\?/, "")
    .split("\\")
    .map((s) => s.trim())
    .filter((s) => s !== "" && s !== ".")
    .join("\\");

export const parentOf = (path: string): string => {
  const i = path.lastIndexOf("\\");
  return i < 0 ? "" : path.slice(0, i);
};

export const baseName = (path: string): string => {
  const i = path.lastIndexOf("\\");
  return i < 0 ? path : path.slice(i + 1);
};

/** Resolve a typed path against a working directory: absolute if it starts
    with \ (or C:), relative otherwise; ".." climbs and can't climb past C:\. */
export const resolvePath = (cwd: string, arg: string): string => {
  const abs = /^\s*([\\/]|[cC]:)/.test(arg);
  const out: string[] = [];
  for (const part of normPath(abs ? arg : `${cwd}\\${arg}`).split("\\"))
    if (part === "..") out.pop();
    else if (part !== "") out.push(part);
  return out.join("\\");
};

const lower = (p: string): string => p.toLowerCase();
/** Is `path` inside `dir` (strictly)? Case-blind, like every lookup here. */
const inside = (path: string, dir: string): boolean =>
  lower(path).startsWith(lower(dir) + "\\");

interface Volume {
  v: 2;
  dirs: string[];
  files: FileEntry[];
}

/** Parse a stored volume; null means "format and reseed". */
function loadVolume(raw: string | null): Volume | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as Volume).v === 2 &&
      Array.isArray((parsed as Volume).dirs) &&
      Array.isArray((parsed as Volume).files)
    ) {
      const vol = parsed as Volume;
      return {
        v: 2,
        dirs: vol.dirs.filter((d): d is string => typeof d === "string"),
        files: vol.files.filter(
          (f): f is FileEntry => typeof f?.name === "string" && typeof f?.text === "string",
        ),
      };
    }
  } catch {
    /* a corrupt volume is a fresh volume, not a crash */
  }
  // a flat-era array, junk, or corruption: all format the same way
  return null;
}

export function makeDisk(store: DiskStore): Disk {
  const raw = store.getItem(KEY);
  let vol = loadVolume(raw);
  const fresh = vol === null;
  if (vol === null) {
    if (raw !== null) for (const k of FORMAT_KEYS) store.removeItem(k);
    vol = { v: 2, dirs: [], files: [] };
  }
  const { dirs, files } = vol;

  const findFile = (name: string): FileEntry | undefined =>
    files.find((f) => lower(f.name) === lower(name));
  const hasDir = (path: string): boolean =>
    path === "" || dirs.some((d) => lower(d) === lower(path));
  const taken = (path: string): boolean => findFile(path) !== undefined || hasDir(path);

  /** Every ancestor of `path` becomes real — a write can't dangle. */
  const ensureParents = (path: string): void => {
    for (let p = parentOf(path); p !== ""; p = parentOf(p))
      if (!hasDir(p)) dirs.push(p);
  };
  /** A file can't be a directory: a path under an existing file is dead. */
  const fileInTheWay = (path: string): boolean => {
    for (let p = parentOf(path); p !== ""; p = parentOf(p)) if (findFile(p)) return true;
    return false;
  };

  // seed law: documentation the machine grew after this volume was formatted
  // arrives on it anyway. A deleted seed comes back on the next boot; the
  // disk keeps saying it. (Edits to a seed are kept — only absence corrects.)
  // Presence is judged by basename anywhere on the volume, so a seed the
  // player merely filed somewhere else doesn't come back as a twin.
  for (const d of SEED_DIRS) if (!hasDir(d)) dirs.push(d);
  const seedPresent = (name: string): boolean =>
    files.some((f) => lower(baseName(f.name)) === lower(baseName(name)));
  for (const s of SEED_FILES)
    if (!seedPresent(s.name) && !hasDir(s.name)) {
      ensureParents(s.name);
      files.push({ ...s });
    }

  const save = (): void => store.setItem(KEY, JSON.stringify({ v: 2, dirs, files }));
  const listeners: ((ev: DiskChange) => void)[] = [];
  const changed = (ev: DiskChange): void => listeners.forEach((cb) => cb(ev));
  const byName = (a: { name: string }, b: { name: string }): number =>
    a.name.localeCompare(b.name);

  const disk: Disk = {
    list: () => [...files].sort(byName),
    listDir(path) {
      const p = normPath(path);
      if (!hasDir(p)) return null;
      const childOf = (name: string): boolean => lower(parentOf(name)) === lower(p);
      return {
        dirs: dirs.filter(childOf).sort((a, b) => a.localeCompare(b)),
        files: files.filter((f) => childOf(f.name)).map((f) => ({ ...f })).sort(byName),
      };
    },
    read: (name) => findFile(normPath(name))?.text ?? null,
    write(name, text) {
      const p = normPath(name);
      if (p === "" || hasDir(p) || fileInTheWay(p)) return false;
      const f = findFile(p);
      if (f) f.text = text;
      else {
        ensureParents(p);
        files.push({ name: p, text });
      }
      save();
      changed({ kind: "write", name: p });
      return true;
    },
    remove(name) {
      const f = findFile(normPath(name));
      if (!f) return false;
      files.splice(files.indexOf(f), 1);
      save();
      changed({ kind: "remove", name: f.name });
      return true;
    },
    rename(from, to) {
      const src = normPath(from);
      const dst = normPath(to);
      if (dst === "" || lower(src) === lower(dst) || fileInTheWay(dst)) return false;
      const f = findFile(src);
      if (f) {
        if (taken(dst)) return false;
        const was = f.name;
        ensureParents(dst);
        f.name = dst;
        save();
        changed({ kind: "rename", name: was, to: dst });
        return true;
      }
      const di = dirs.findIndex((d) => lower(d) === lower(src));
      if (di < 0 || taken(dst)) return false;
      // a directory can't move into its own subtree — there is no floor to land on
      if (inside(dst, src)) return false;
      const was = dirs[di]!;
      ensureParents(dst);
      const moved: { name: string; to: string }[] = [];
      const rebase = (name: string): string => dst + name.slice(was.length);
      dirs[di] = dst;
      for (let i = 0; i < dirs.length; i++)
        if (inside(dirs[i]!, was)) dirs[i] = rebase(dirs[i]!);
      for (const file of files)
        if (inside(file.name, was)) {
          moved.push({ name: file.name, to: rebase(file.name) });
          file.name = rebase(file.name);
        }
      save();
      changed({ kind: "rename", name: was, to: dst });
      // every carried file announces itself, so pins and desk seats re-key
      for (const m of moved) changed({ kind: "rename", name: m.name, to: m.to });
      return true;
    },
    exists: (name) => findFile(normPath(name)) !== undefined,
    isDir: (path) => hasDir(normPath(path)),
    mkdir(path) {
      const p = normPath(path);
      if (p === "" || taken(p) || fileInTheWay(p)) return false;
      ensureParents(p);
      dirs.push(p);
      save();
      changed({ kind: "mkdir", name: p });
      return true;
    },
    rmdir(path) {
      const p = normPath(path);
      const i = dirs.findIndex((d) => lower(d) === lower(p));
      if (i < 0) return false;
      if (dirs.some((d) => inside(d, p)) || files.some((f) => inside(f.name, p))) return false;
      dirs.splice(i, 1);
      save();
      changed({ kind: "rmdir", name: p });
      return true;
    },
    onChange: (cb) => void listeners.push(cb),
  };

  if (fresh) save(); // persist the seeds so the volume exists from first boot

  return disk;
}
