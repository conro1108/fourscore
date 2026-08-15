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
 * an empty one, not a crash — and an empty volume gets the seed files, so
 * a fresh machine arrives with its own documentation on it.
 */

import { SEED_FILES } from "./copy.js";

export interface FileEntry {
  name: string;
  text: string;
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
  }

  const save = (): void => store.setItem(KEY, JSON.stringify(files));
  const find = (name: string): FileEntry | undefined =>
    files.find((f) => f.name.toLowerCase() === name.toLowerCase());

  const disk: Disk = {
    list: () => [...files].sort((a, b) => a.name.localeCompare(b.name)),
    read: (name) => find(name)?.text ?? null,
    write(name, text) {
      const f = find(name);
      if (f) f.text = text;
      else files.push({ name, text });
      save();
    },
    remove(name) {
      const f = find(name);
      if (!f) return false;
      files = files.filter((x) => x !== f);
      save();
      return true;
    },
    rename(from, to) {
      const f = find(from);
      if (!f || find(to)) return false;
      f.name = to;
      save();
      return true;
    },
    exists: (name) => find(name) !== undefined,
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
