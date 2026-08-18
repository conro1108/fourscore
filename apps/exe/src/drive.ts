/**
 * The drive's media. The machine came with a disc in it, the way a machine
 * of the period came with a CD in the caddy, and what is on it is a language
 * model: 260,032 weights, one byte each, plus the tables that go with them.
 * apps/exe/tools/llm/pack.ts makes it; /src/llm.c reads it.
 *
 * It is fetched rather than bundled — 361KB is a lot to put in a script that
 * every visitor parses, and nothing but one program on the disk ever wants
 * it. Until it arrives (or if it never does, because the file is not being
 * served) the bay reads as zeros, which is what an empty drive did, and the
 * program on the disk says so rather than faulting.
 *
 * `mount()` hands out a *copy* every time, because a program writes to the
 * drive — llm.c keeps its whole key/value cache there — and the next program
 * to run is entitled to the media it came with.
 */

// Vite's BASE_URL always ends in a slash, and it is allowed to be a whole
// origin (a CDN), so this is a join and not a path concatenation to be
// tidied up afterwards — collapsing repeated slashes would eat the "//".
const MEDIA_URL = `${import.meta.env.BASE_URL ?? "/"}WEIGHTS.BIN`;

let media: Uint8Array | null = null;

/** Start the fetch. Nothing waits on it; the drive is simply empty until it
    lands. Called once at boot. */
export function loadMedia(fetcher: typeof fetch = fetch): void {
  fetcher(MEDIA_URL)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((b) => {
      if (b) media = new Uint8Array(b);
    })
    .catch(() => {
      /* no media in the bay, which is a state the machine understands */
    });
}

/** What a running program sees on the drive: its own copy, or nothing. */
export function mount(): Uint8Array | null {
  return media === null ? null : Uint8Array.from(media);
}

/** For the tests and the harnesses, which build the media themselves. */
export function setMedia(bytes: Uint8Array | null): void {
  media = bytes;
}
