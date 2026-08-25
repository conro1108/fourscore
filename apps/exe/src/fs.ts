/**
 * The disk: one localStorage key holding the whole volume. The desktop is
 * the directory DESKTOP. Paths are backslash-joined segments with no drive
 * ("DESKTOP\readme.txt"); lookup is case-blind on the whole path, names keep
 * their saved case. A corrupt or pre-v2 volume is formatted (plus its sibling
 * keys), not migrated. Missing seeds are re-added on every boot; edits kept.
 */

import { SEED_DIRS, SEED_FILES } from "./copy.js";

export interface FileEntry {
  /** Full path, case as saved. */
  name: string;
  text: string;
}

export interface DiskChange {
  kind: "write" | "remove" | "rename" | "mkdir" | "rmdir";
  name: string;
  to?: string;
}

export interface Disk {
  list(): readonly FileEntry[];
  /** Direct children. "" is the root. Null if no such dir. */
  listDir(path: string): { dirs: string[]; files: FileEntry[] } | null;
  read(name: string): string | null;
  /** False if a directory already owns the name. Creates missing parents. */
  write(name: string, text: string): boolean;
  /** False if there was no such file. */
  remove(name: string): boolean;
  /** Files and dirs. A dir rename also emits a rename per carried file (pins/placement re-key). */
  rename(from: string, to: string): boolean;
  exists(name: string): boolean;
  isDir(path: string): boolean;
  /** False if the name is taken (file or dir). Creates missing parents. */
  mkdir(path: string): boolean;
  /** False unless the directory exists and is empty. */
  rmdir(path: string): boolean;
  onChange(cb: (ev: DiskChange) => void): void;
}

export interface DiskStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = "exe.fs";
/** Removed together on a format. */
const FORMAT_KEYS = ["exe.fs", "exe.shell", "exe.deskgames", "exe.pins", "exe.untitled", "exe.desk"];

/** Canonical path: backslashes, no drive, no blank segments. */
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

/** Absolute if it starts with \ or C:, else relative to cwd; ".." can't climb past root. */
export const resolvePath = (cwd: string, arg: string): string => {
  const abs = /^\s*([\\/]|[cC]:)/.test(arg);
  const out: string[] = [];
  for (const part of normPath(abs ? arg : `${cwd}\\${arg}`).split("\\"))
    if (part === "..") out.pop();
    else if (part !== "") out.push(part);
  return out.join("\\");
};

const lower = (p: string): string => p.toLowerCase();
/** Strictly inside, case-blind. */
const inside = (path: string, dir: string): boolean =>
  lower(path).startsWith(lower(dir) + "\\");

interface Volume {
  v: 2;
  dirs: string[];
  files: FileEntry[];
}

/** Null means format and reseed. */
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
    /* corrupt = fresh */
  }
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

  const ensureParents = (path: string): void => {
    for (let p = parentOf(path); p !== ""; p = parentOf(p))
      if (!hasDir(p)) dirs.push(p);
  };
  const fileInTheWay = (path: string): boolean => {
    for (let p = parentOf(path); p !== ""; p = parentOf(p)) if (findFile(p)) return true;
    return false;
  };

  // Missing seeds return each boot; edits are kept. Presence is judged by
  // basename anywhere on the volume, so a filed-away seed isn't twinned.
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

  if (fresh) save();

  return disk;
}
