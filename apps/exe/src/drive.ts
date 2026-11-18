/**
 * Drive media: WEIGHTS.BIN (260,032 one-byte weights + tables), made by
 * tools/llm/pack.ts, read by /src/llm.c. Fetched, not bundled (361KB); until
 * it lands the drive reads empty and llm.c reports that rather than faulting.
 * `mount()` returns a copy — llm.c writes its KV cache into the drive, past
 * the end of the file: the header says how big the drive has to be, and the
 * cache is never shipped (it would be ~0.8MB of zeros).
 */

// BASE_URL ends in a slash and may be a full origin — don't collapse slashes.
const MEDIA_URL = `${import.meta.env.BASE_URL ?? "/"}WEIGHTS.BIN`;

let media: Uint8Array | null = null;

/** Start the fetch; nothing waits on it. Called once at boot. */
export function loadMedia(fetcher: typeof fetch = fetch): void {
  fetcher(MEDIA_URL)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((b) => {
      if (b) media = new Uint8Array(b);
    })
    .catch(() => {
      /* empty drive is a valid state */
    });
}

/** Header: 'LM' magic at 0, drive size as a u32 at 44 (tools/llm/pack.ts). */
const MAGIC = 0x4d4c;
const DRIVE_BYTES_AT = 44;

/** A writable drive holding `image`, as large as its header asks. */
export function driveFor(image: Uint8Array): Uint8Array {
  const u16 = (a: number): number => image[a]! | (image[a + 1]! << 8);
  const want =
    image.length > DRIVE_BYTES_AT + 4 && u16(0) === MAGIC ? (u16(DRIVE_BYTES_AT) | (u16(DRIVE_BYTES_AT + 2) << 16)) >>> 0 : 0;
  const d = new Uint8Array(Math.max(image.length, want));
  d.set(image);
  return d;
}

/** What a running program sees on the drive: its own copy, or nothing. */
export function mount(): Uint8Array | null {
  return media === null ? null : driveFor(media);
}

/** Tests/harnesses supply their own media. */
export function setMedia(bytes: Uint8Array | null): void {
  media = bytes;
}
