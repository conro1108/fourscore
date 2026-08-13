/**
 * Themes — five art directions for the whole stage, switchable live.
 *
 * A design exploration, not a settled look: each theme restyles the *expensive*
 * layer of the frame — the void shader's palette, the environment sky, the
 * lights, the board's materials, the discs, the post stack — while the props
 * stay exactly as cheap and canned as they are in every direction. Whatever
 * direction wins, the two-budget collision survives, because the themes only
 * ever touch one side of it.
 *
 * `fever` is the incumbent: its values are the current look transcribed
 * exactly, so switching to it renders what shipped before this file existed.
 * The other four are deliberate departures, not remixes.
 *
 * Everything reads the theme through `ThemeContext` (provided by StageView),
 * which is what lets the preview harness pin a theme per tile while the app
 * follows the persisted store.
 */

import { createContext, useContext } from "react";
import { create } from "zustand";

export type ThemeId = "fever" | "parlor" | "porcelain" | "arcade" | "abyss";

export interface MaterialSpec {
  color: string;
  roughness: number;
  metalness: number;
  iridescence: number;
  iridescenceIOR: number;
  clearcoat: number;
  clearcoatRoughness: number;
  envMapIntensity: number;
}

/** One over-bright panel in the sky nothing emits (see VoidSky). */
export interface SkyPanel {
  color: [number, number, number];
  position: [number, number, number];
  scale: [number, number];
}

interface LightSpec {
  color: string;
  intensity: number;
  position: [number, number, number];
}

export interface Theme {
  id: ThemeId;
  name: string;
  /** One line for the dev panel — what this direction is arguing for. */
  blurb: string;
  /**
   * The void shader's palette, authored in screen sRGB like the shader's own
   * constants (see the `srgb` note in VoidBackdrop). The heat family is not
   * here on purpose: fever means arterial red in every direction, or
   * escalation stops being legible the moment a theme changes.
   */
  void: {
    /** The radial well: bruised center falling to near-black edge. */
    well: string;
    edge: string;
    /** The two drifting weather fields. */
    weatherA: string;
    weatherB: string;
    /** Multiplier on both weather fields' contribution. 1 is the fever dream. */
    weatherGain: number;
    /** The oil-slick ramp, low → mid → high film thickness. */
    slick: [string, string, string];
    slickGain: number;
    /** The faint vertical grade that gives the nothing an "up". */
    grade: string;
  };
  sky: { bg: string; panels: SkyPanel[] };
  lights: {
    ambient: { color: string; intensity: number };
    key: LightSpec;
    rim: LightSpec;
    fill: LightSpec;
  };
  board: {
    plate: MaterialSpec;
    rail: MaterialSpec;
    eyelet: MaterialSpec;
  };
  discs: {
    red: { color: string; emissive: string };
    yellow: { color: string; emissive: string };
    emissiveIntensity: number;
    finish: {
      roughness: number;
      metalness: number;
      iridescence: number;
      iridescenceIOR: number;
      envMapIntensity: number;
    };
    /** A settled disc outside the winning line. */
    dimmed: string;
    /** The review's "what you actually played" ghost. */
    ghostSpent: string;
  };
  post: {
    /** Bloom luminance threshold — a light theme blooms at 0.32 and whites out. */
    bloomThreshold: number;
    vignette: number;
  };
}

const mat = (over: Partial<MaterialSpec> & { color: string }): MaterialSpec => ({
  roughness: 0.5,
  metalness: 0,
  iridescence: 0,
  iridescenceIOR: 1.5,
  clearcoat: 0,
  clearcoatRoughness: 0.2,
  envMapIntensity: 1,
  ...over,
});

export const THEMES: Record<ThemeId, Theme> = {
  /**
   * The incumbent. Every value below is the pre-theme look transcribed exactly
   * — VoidBackdrop's constants, VoidSky's panels, Lights, BoardRig, Discs —
   * so this theme is the regression test for the other four.
   */
  fever: {
    id: "fever",
    name: "Fever Dream",
    blurb: "the incumbent — goth gradients, lacquered obsidian, possessed",
    void: {
      well: "#1e1132",
      edge: "#0b0715",
      weatherA: "#241033",
      weatherB: "#081c21",
      weatherGain: 1,
      slick: ["#b81a8c", "#0d7578", "#cc9429"],
      slickGain: 1,
      grade: "#0b0510",
    },
    sky: {
      bg: "#07040e",
      panels: [
        { color: [2.6, 0.5, 1.9], position: [0, 3, -9], scale: [16, 3] },
        { color: [0.2, 1.5, 1.4], position: [-5, -6, 5], scale: [12, 4] },
        { color: [2.4, 1.7, 0.5], position: [7, 6, 3], scale: [2, 9] },
        { color: [0.9, 0.3, 1.9], position: [0, -9, -3], scale: [10, 6] },
        { color: [0.55, 0.2, 0.8], position: [3, 2, 10], scale: [18, 10] },
        { color: [0.25, 0.45, 0.5], position: [-6, -2, 9], scale: [8, 8] },
      ],
    },
    lights: {
      ambient: { color: "#8f7bb0", intensity: 0.5 },
      key: { color: "#ffeeda", intensity: 1.6, position: [6, 9, 8] },
      rim: { color: "#7a2bd0", intensity: 60, position: [-7, 3, -5] },
      fill: { color: "#1d5a6e", intensity: 9, position: [3, -7, 7] },
    },
    board: {
      plate: mat({
        color: "#33204a",
        roughness: 0.34,
        metalness: 0.35,
        iridescence: 0.85,
        iridescenceIOR: 1.6,
        clearcoat: 1,
        clearcoatRoughness: 0.18,
        envMapIntensity: 2.1,
      }),
      rail: mat({
        color: "#8f84a8",
        roughness: 0.18,
        metalness: 1,
        iridescence: 0.5,
        iridescenceIOR: 1.6,
        envMapIntensity: 1.9,
      }),
      eyelet: mat({
        color: "#a99cc0",
        roughness: 0.14,
        metalness: 1,
        iridescence: 0.4,
        iridescenceIOR: 1.6,
        envMapIntensity: 1.7,
      }),
    },
    discs: {
      red: { color: "#a3164e", emissive: "#5c0b2a" },
      yellow: { color: "#c8991f", emissive: "#6e510d" },
      emissiveIntensity: 0.25,
      finish: {
        roughness: 0.18,
        metalness: 0.4,
        iridescence: 0.7,
        iridescenceIOR: 1.4,
        envMapIntensity: 1.0,
      },
      dimmed: "#3a2f42",
      ghostSpent: "#7a6899",
    },
    post: { bloomThreshold: 0.32, vignette: 0.55 },
  },

  /**
   * The toy in a lamplit room. Walnut under french polish, brass rails, discs
   * as painted wood — cream and oxblood. The void goes warm umber with dust
   * drifting through lamplight; the sky is candle and bottle-green. The
   * argument: the game as a loved object instead of a haunted one.
   */
  parlor: {
    id: "parlor",
    name: "Heirloom Parlor",
    blurb: "walnut, brass, lamplight — the toy as a loved antique",
    // Darker than the first pass on purpose: the walnut board and an umber
    // void at the same value read as one brown mush — the room recedes so the
    // object can sit in front of it.
    void: {
      well: "#1f1309",
      edge: "#0a0603",
      weatherA: "#33200d",
      weatherB: "#22110b",
      weatherGain: 0.8,
      slick: ["#8c5a24", "#5a3c1a", "#c09040"],
      slickGain: 0.5,
      grade: "#120a04",
    },
    sky: {
      bg: "#140b06",
      panels: [
        { color: [2.2, 1.2, 0.45], position: [0, 3, -9], scale: [16, 3] },
        { color: [0.8, 0.45, 0.18], position: [-5, -6, 5], scale: [12, 4] },
        { color: [2.5, 1.7, 0.7], position: [7, 6, 3], scale: [2, 9] },
        { color: [0.5, 0.28, 0.1], position: [0, -9, -3], scale: [10, 6] },
        { color: [0.75, 0.52, 0.3], position: [3, 2, 10], scale: [18, 10] },
        { color: [0.3, 0.38, 0.18], position: [-6, -2, 9], scale: [8, 8] },
      ],
    },
    lights: {
      ambient: { color: "#a98a5e", intensity: 0.5 },
      key: { color: "#ffd9a6", intensity: 1.7, position: [5, 8, 7] },
      rim: { color: "#b3541e", intensity: 30, position: [-7, 3, -5] },
      fill: { color: "#4a5e2a", intensity: 6, position: [3, -6, 7] },
    },
    board: {
      plate: mat({
        color: "#452a11",
        roughness: 0.48,
        metalness: 0,
        clearcoat: 0.55,
        clearcoatRoughness: 0.3,
        envMapIntensity: 0.7,
      }),
      rail: mat({ color: "#a97c30", roughness: 0.3, metalness: 1, envMapIntensity: 1.4 }),
      eyelet: mat({ color: "#c2953f", roughness: 0.25, metalness: 1, envMapIntensity: 1.5 }),
    },
    discs: {
      red: { color: "#77222c", emissive: "#3c0f14" },
      yellow: { color: "#e8d9b4", emissive: "#6e5f3a" },
      emissiveIntensity: 0.12,
      finish: {
        roughness: 0.38,
        metalness: 0.05,
        iridescence: 0,
        iridescenceIOR: 1.4,
        envMapIntensity: 0.55,
      },
      dimmed: "#4a3b2b",
      ghostSpent: "#b09a6d",
    },
    post: { bloomThreshold: 0.5, vignette: 0.6 },
  },

  /**
   * A bright room with one object in it. Matte porcelain board, glazed
   * terracotta and ink discs, gallery daylight, and a void that is a pale wall
   * instead of a nothing. The argument: the game reads as a modern art object
   * — and it's the stress test for whether the look survives a light theme.
   */
  porcelain: {
    id: "porcelain",
    name: "Porcelain Gallery",
    blurb: "matte ceramic in gallery daylight — the light-theme art object",
    // Mid-gray gallery wall, not white-white: the first pass sat above the
    // bloom threshold and the whole frame whited out. The board stays the
    // brightest thing in frame — a light object against a mid wall.
    void: {
      well: "#b3aea2",
      edge: "#6f6d78",
      weatherA: "#4a4438",
      weatherB: "#36404a",
      weatherGain: 0.15,
      slick: ["#c9a9b8", "#a9c4c9", "#d8c9a0"],
      slickGain: 0.3,
      grade: "#26262c",
    },
    sky: {
      bg: "#d8d4cc",
      panels: [
        { color: [1.45, 1.4, 1.3], position: [0, 3, -9], scale: [16, 3] },
        { color: [1.2, 1.15, 1.02], position: [-5, -6, 5], scale: [12, 4] },
        { color: [1.55, 1.35, 1.1], position: [7, 6, 3], scale: [2, 9] },
        { color: [1.05, 1.05, 1.0], position: [0, -9, -3], scale: [10, 6] },
        { color: [1.3, 1.28, 1.2], position: [3, 2, 10], scale: [18, 10] },
        { color: [1.0, 1.1, 1.25], position: [-6, -2, 9], scale: [8, 8] },
      ],
    },
    lights: {
      ambient: { color: "#f2efe8", intensity: 0.7 },
      key: { color: "#fff4e2", intensity: 1.15, position: [4, 10, 6] },
      rim: { color: "#c9d4e8", intensity: 16, position: [-7, 4, -4] },
      fill: { color: "#e8d9c9", intensity: 4, position: [3, -6, 7] },
    },
    board: {
      // Bone, not white: under the gallery key an #ec plate crossed 1.0 and
      // bloomed into a light box. The ceramic reads from the value gap to the
      // gray wall, not from being at the top of the histogram.
      plate: mat({
        color: "#cfc9ba",
        roughness: 0.42,
        metalness: 0,
        clearcoat: 0.4,
        clearcoatRoughness: 0.35,
        envMapIntensity: 0.5,
      }),
      rail: mat({ color: "#b5afa2", roughness: 0.35, metalness: 0.15, envMapIntensity: 0.6 }),
      eyelet: mat({ color: "#c9a86a", roughness: 0.3, metalness: 1, envMapIntensity: 1.0 }),
    },
    discs: {
      red: { color: "#c25a35", emissive: "#612a16" },
      yellow: { color: "#2e4d68", emissive: "#16242f" },
      emissiveIntensity: 0.1,
      finish: {
        roughness: 0.22,
        metalness: 0.05,
        iridescence: 0.15,
        iridescenceIOR: 1.3,
        envMapIntensity: 0.9,
      },
      dimmed: "#b7b1a4",
      ghostSpent: "#8f887a",
    },
    // Above LDR white (plus the smoothing band): in a bright room only genuine
    // emitters — the winning line — get to bloom.
    post: { bloomThreshold: 1.15, vignette: 0.35 },
  },

  /**
   * Neon after hours. Piano-black chrome board, discs that are their own light
   * source — hot pink against cyan — and a void of magenta and electric teal
   * weather. The argument: keep the night, trade the goth for voltage.
   */
  arcade: {
    id: "arcade",
    name: "Midnight Arcade",
    blurb: "piano black and neon — the night, rewired for voltage",
    // Bluer-black than the fever dream's bruised purple, so the two night
    // themes read as different nights — this one's color comes from the neon,
    // not the walls.
    void: {
      well: "#070b1c",
      edge: "#020206",
      weatherA: "#5c0e44",
      weatherB: "#0a4456",
      weatherGain: 1.1,
      slick: ["#ff2d96", "#12d8e8", "#7a3cff"],
      slickGain: 1.2,
      grade: "#0c1030",
    },
    sky: {
      bg: "#05050e",
      panels: [
        { color: [2.8, 0.3, 1.5], position: [0, 3, -9], scale: [16, 3] },
        { color: [0.2, 2.2, 2.4], position: [-5, -6, 5], scale: [12, 4] },
        { color: [1.4, 0.5, 2.6], position: [7, 6, 3], scale: [2, 9] },
        { color: [0.2, 0.3, 1.4], position: [0, -9, -3], scale: [10, 6] },
        { color: [0.4, 0.3, 0.9], position: [3, 2, 10], scale: [18, 10] },
        { color: [0.2, 0.5, 0.6], position: [-6, -2, 9], scale: [8, 8] },
      ],
    },
    lights: {
      ambient: { color: "#4a4a7a", intensity: 0.4 },
      key: { color: "#cfd6ff", intensity: 1.2, position: [6, 9, 8] },
      rim: { color: "#ff2d96", intensity: 70, position: [-7, 3, -5] },
      fill: { color: "#12d8e8", intensity: 22, position: [3, -7, 7] },
    },
    board: {
      plate: mat({
        color: "#101018",
        roughness: 0.12,
        metalness: 0.55,
        iridescence: 0.35,
        iridescenceIOR: 1.8,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        envMapIntensity: 2.6,
      }),
      rail: mat({
        color: "#d0d4e8",
        roughness: 0.08,
        metalness: 1,
        iridescence: 0.25,
        iridescenceIOR: 1.6,
        envMapIntensity: 2.4,
      }),
      eyelet: mat({ color: "#b8c0e0", roughness: 0.1, metalness: 1, envMapIntensity: 2.2 }),
    },
    discs: {
      red: { color: "#ff2d78", emissive: "#ff2d78" },
      yellow: { color: "#14cfe0", emissive: "#14cfe0" },
      emissiveIntensity: 0.55,
      finish: {
        roughness: 0.15,
        metalness: 0.5,
        iridescence: 0.35,
        iridescenceIOR: 1.6,
        envMapIntensity: 1.6,
      },
      dimmed: "#26263a",
      ghostSpent: "#8080c0",
    },
    post: { bloomThreshold: 0.3, vignette: 0.6 },
  },

  /**
   * The bottom of something. Verdigris bronze board like a wreck's fitting,
   * discs as jade and amber lanterns, teal light shafting down from a surface
   * that isn't shown. The argument: keep the depth and the glow, swap the
   * menace for pressure.
   */
  abyss: {
    id: "abyss",
    name: "The Abyss",
    blurb: "verdigris bronze and lantern-fish glow — pressure, not menace",
    // Deep, not aquarium: the first pass bloomed the whole teal field into a
    // bright wall. Darker well, bluer second field, and the glow belongs to
    // the discs.
    void: {
      well: "#041318",
      edge: "#010608",
      weatherA: "#0a3a30",
      weatherB: "#05202e",
      weatherGain: 0.85,
      slick: ["#18b09a", "#0f6a88", "#7ac48a"],
      slickGain: 0.6,
      grade: "#051a20",
    },
    sky: {
      bg: "#031311",
      panels: [
        { color: [0.4, 1.6, 1.3], position: [0, 6, -9], scale: [16, 4] },
        { color: [0.2, 0.9, 0.5], position: [-5, -6, 5], scale: [12, 4] },
        { color: [0.3, 1.2, 1.5], position: [7, 7, 3], scale: [3, 9] },
        { color: [1.4, 0.7, 0.2], position: [0, -9, -3], scale: [10, 5] },
        { color: [0.15, 0.5, 0.45], position: [3, 2, 10], scale: [18, 10] },
        { color: [0.1, 0.3, 0.4], position: [-6, -2, 9], scale: [8, 8] },
      ],
    },
    lights: {
      ambient: { color: "#3f6e66", intensity: 0.4 },
      key: { color: "#bfeadf", intensity: 1.3, position: [2, 10, 5] },
      rim: { color: "#16a58c", intensity: 40, position: [-7, 4, -5] },
      fill: { color: "#0c4a6e", intensity: 14, position: [3, -7, 7] },
    },
    board: {
      plate: mat({
        color: "#1d3831",
        roughness: 0.5,
        metalness: 0.55,
        iridescence: 0.4,
        iridescenceIOR: 1.4,
        clearcoat: 0.5,
        clearcoatRoughness: 0.4,
        envMapIntensity: 1.3,
      }),
      rail: mat({ color: "#557a68", roughness: 0.35, metalness: 1, envMapIntensity: 1.4 }),
      eyelet: mat({ color: "#7a9a84", roughness: 0.3, metalness: 1, envMapIntensity: 1.4 }),
    },
    discs: {
      red: { color: "#e0a03c", emissive: "#8a5a14" },
      yellow: { color: "#2ad4a0", emissive: "#1a8a68" },
      emissiveIntensity: 0.5,
      finish: {
        roughness: 0.3,
        metalness: 0.25,
        iridescence: 0.5,
        iridescenceIOR: 1.35,
        envMapIntensity: 0.9,
      },
      dimmed: "#22332e",
      ghostSpent: "#6aa392",
    },
    post: { bloomThreshold: 0.5, vignette: 0.6 },
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export const themeById = (id: string | null | undefined): Theme =>
  (id && THEMES[id as ThemeId]) || THEMES.fever;

/**
 * Provided by StageView so a harness tile can pin a theme while the app
 * follows the store. Everything under the canvas reads this, never the store —
 * that indirection is the whole reason five themed tiles can share one page.
 */
export const ThemeContext = createContext<Theme>(THEMES.fever);
export const useTheme = (): Theme => useContext(ThemeContext);

const KEY = "fourscore.theme";

interface ThemeStore {
  themeId: ThemeId;
  setTheme(id: ThemeId): void;
}

function loadThemeId(): ThemeId {
  try {
    const raw = localStorage.getItem(KEY);
    return raw && raw in THEMES ? (raw as ThemeId) : "fever";
  } catch {
    return "fever";
  }
}

export const useThemeStore = create<ThemeStore>((set) => ({
  themeId: loadThemeId(),
  setTheme: (themeId) => {
    set({ themeId });
    try {
      localStorage.setItem(KEY, themeId);
    } catch {
      /* storage off — the theme just doesn't survive a reload */
    }
  },
}));
