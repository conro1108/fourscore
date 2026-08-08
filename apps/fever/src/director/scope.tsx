/**
 * Scene-scoped pins.
 *
 * Subsystems inside the scene read the Director through this scope rather than
 * reaching for the store directly. In the app the scope is empty and everything
 * resolves to the live Director — nothing changes. In the preview harness a
 * state pins what it needs frozen, which is what lets one page render the same
 * board at fever 0, 0.5 and 1 side by side, or a prop held mid-act for a
 * screenshot — the comparisons the taste gates are made on.
 *
 * This is the "scene-scope object, designed once" the phase-1 ledger asked for:
 * when a harness state needs to pin something new, it grows a field here, it
 * does not become another drilled prop.
 *
 * Fever is exposed as a getter, not a value, because its consumers all live in
 * a `useFrame` and must not re-render sixty times a second to receive a number.
 *
 * The provider goes *inside* the Canvas on purpose: react-three-fiber renders
 * into its own reconciler, so a provider in the DOM tree above it isn't
 * guaranteed to reach scene children.
 */

import { createContext, useContext, useMemo } from "react";
import { directorFrame } from "./store.js";

export interface ScenePin {
  /** Pin fever for this scene. Undefined means "follow the Director". */
  fever?: number;
  /**
   * Freeze a named prop act at a phase of its choreography (0..1). Harness
   * only: the app never sets it, so acts play out live. Undefined means props
   * run on the event bus as usual.
   */
  prop?: { name: string; phase: number };
}

const Scope = createContext<ScenePin>({});

export function ScenePinProvider({
  pin,
  children,
}: {
  pin?: ScenePin;
  children: React.ReactNode;
}) {
  const value = useMemo(() => pin ?? {}, [pin]);
  return <Scope.Provider value={value}>{children}</Scope.Provider>;
}

/** The one way scene subsystems should ask what the fever is. */
export function useFeverSource(): () => number {
  const { fever } = useContext(Scope);
  return useMemo(() => (fever === undefined ? liveFever : () => fever), [fever]);
}

/** The prop pin, if this scene has one. */
export function usePinnedProp(): ScenePin["prop"] {
  return useContext(Scope).prop;
}

const liveFever = (): number => directorFrame().fever;
