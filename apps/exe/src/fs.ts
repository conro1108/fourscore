/**
 * The disk. C:\ is a real place now: a file saved in Notepad survives the
 * tab closing, COMMAND.COM lists it, and a program runs from it. The whole
 * volume is one localStorage key, because the browser's storage is the only
 * disk this machine has — which keeps the period ratio intact: a few
 * megabytes was a hard drive in 1996, and a few megabytes is what we got.
 *
 * Lookup is DOS-cased (README.TXT and readme.txt are the same file) but a
 * name keeps the case it was saved with, which is also what the period did.
 *
 * The store is injected so the tests can hand in a plain object; the app
 * makes one disk in main.ts and passes it down. A corrupt volume loads as
 * a fresh one, not a crash — and a fresh volume gets the seed files, so a
 * machine always arrives with its own documentation on it. An old volume is
 * topped up with any seed it is missing (edits to a seed are kept; only its
 * absence is corrected), so documentation the machine grew later still
 * reaches every disk.
 */

import { SEED_FILES } from "./copy.js";

export interface FileEntry {
  name: string;
  text: string;
}

export interface DiskChange {
  kind: "write" | "remove" | "rename";
  name: string;
  /** The new name, for renames. */
  to?: string;
}

export interface Disk {
  /** Every file, sorted by name. */
  list(): readonly FileEntry[];
  read(name: string): string | null;
  write(name: string, text: string): void;
  /** False if there was no such file. */
  remove(name: string): boolean;
  /** False if the source is missing or the target already exists. */
  rename(from: string, to: string): boolean;
  exists(name: string): boolean;
  /** The desk listens: files made in one place appear in the other. */
  onChange(cb: (ev: DiskChange) => void): void;
}

export interface DiskStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = "exe.fs";
/** The old single-slot Notepad buffer; migrated into the volume once. */
const LEGACY_UNTITLED = "exe.untitled";

export function makeDisk(store: DiskStore): Disk {
  const raw = store.getItem(KEY);
  let files: FileEntry[] = [];
  if (raw === null) {
    // a fresh machine ships with its manual on the disk
    files = SEED_FILES.map((f) => ({ ...f }));
  } else {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed))
        files = parsed.filter(
          (f): f is FileEntry =>
            typeof (f as FileEntry)?.name === "string" && typeof (f as FileEntry)?.text === "string",
        );
    } catch {
      /* a corrupt volume is an empty volume, not a crash */
    }
    // documentation the machine grew after this volume was formatted arrives
    // on it anyway — a manual referenced by HELP must exist to be typed. A
    // deleted seed comes back on the next boot; the disk keeps saying it.
    for (const s of SEED_FILES)
      if (!files.some((f) => f.name.toLowerCase() === s.name.toLowerCase())) files.push({ ...s });
  }

  const save = (): void => store.setItem(KEY, JSON.stringify(files));
  const find = (name: string): FileEntry | undefined =>
    files.find((f) => f.name.toLowerCase() === name.toLowerCase());
  const listeners: ((ev: DiskChange) => void)[] = [];
  const changed = (ev: DiskChange): void => listeners.forEach((cb) => cb(ev));

  const disk: Disk = {
    list: () => [...files].sort((a, b) => a.name.localeCompare(b.name)),
    read: (name) => find(name)?.text ?? null,
    write(name, text) {
      const f = find(name);
      if (f) f.text = text;
      else files.push({ name, text });
      save();
      changed({ kind: "write", name });
    },
    remove(name) {
      const f = find(name);
      if (!f) return false;
      files = files.filter((x) => x !== f);
      save();
      changed({ kind: "remove", name: f.name });
      return true;
    },
    rename(from, to) {
      const f = find(from);
      if (!f || find(to)) return false;
      const was = f.name;
      f.name = to;
      save();
      changed({ kind: "rename", name: was, to });
      return true;
    },
    exists: (name) => find(name) !== undefined,
    onChange: (cb) => void listeners.push(cb),
  };

  // migrate the pre-disk untitled.txt buffer, then retire the key
  const legacy = store.getItem(LEGACY_UNTITLED);
  if (legacy !== null) {
    disk.write("untitled.txt", legacy);
    store.removeItem(LEGACY_UNTITLED);
  } else if (raw === null) {
    save(); // persist the seeds so the volume exists from first boot
  }

  return disk;
}
