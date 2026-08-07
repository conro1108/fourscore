/**
 * A scoped fever source.
 *
 * Subsystems inside the scene read fever through `useFeverSource()` rather than
 * reaching for the store directly. In the app that resolves to the Director, and
 * nothing changes. In the preview harness it resolves to whatever that state
 * pinned, which is what lets one page render the same board at fever 0, 0.5 and
 * 1 side by side — the comparison the taste gates are made on. A single global
 * would make that page show three copies of one temperature.
 *
 * A getter, not a value, because these consumers all live in a `useFrame` and
 * must not re-render sixty times a second to receive a number.
 *
 * The provider goes *inside* the Canvas on purpose: react-three-fiber renders
 * into its own reconciler, so a provider in the DOM tree above it isn't
 * guaranteed to reach scene children.
 */

import { createContext, useContext, useMemo } from "react";
import { directorFrame } from "./store.js";

const FeverScope = createContext<(() => number) | null>(null);

export function FeverProvider({
  fever,
  children,
}: {
  /** Pin fever for this scene. Undefined means "follow the Director". */
  fever?: number;
  children: React.ReactNode;
}) {
  const source = useMemo(
    () => (fever === undefined ? null : () => fever),
    [fever],
  );
  return <FeverScope.Provider value={source}>{children}</FeverScope.Provider>;
}

/** The one way scene subsystems should ask what the fever is. */
export function useFeverSource(): () => number {
  const scoped = useContext(FeverScope);
  return scoped ?? liveFever;
}

const liveFever = (): number => directorFrame().fever;
