/**
 * The canvas the game is drawn on, plus pointer handling.
 *
 * Everything visual lives in `BoardScene`; this component only owns the canvas
 * element's lifetime and turns pointer positions into column numbers. The scene
 * is deliberately not re-created when the model changes — it runs its own
 * animation loop and is handed a fresh snapshot each render.
 */

import { useEffect, useRef } from "react";
import { BoardScene, SCENE_H, SCENE_W, type SceneModel } from "../render/boardScene.js";

interface Props {
  model: SceneModel;
  onColumn?: (col: number) => void;
  onHover?: (col: number | null) => void;
  /** Set once on mount so the parent can drive drop animations. */
  sceneRef?: (scene: BoardScene | null) => void;
}

export function Board({ model, onColumn, onHover, sceneRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useRef<BoardScene | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const s = new BoardScene(canvasRef.current);
    scene.current = s;
    sceneRef?.(s);
    return () => {
      s.destroy();
      scene.current = null;
      sceneRef?.(null);
    };
    // The scene must outlive model changes, so this runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scene.current?.update(model);
  }, [model]);

  return (
    <canvas
      ref={canvasRef}
      className="board"
      width={SCENE_W}
      height={SCENE_H}
      role="grid"
      aria-label="Connect four board"
      onPointerMove={(e) => onHover?.(scene.current?.columnAt(e.clientX) ?? null)}
      onPointerLeave={() => onHover?.(null)}
      onPointerDown={(e) => {
        const col = scene.current?.columnAt(e.clientX);
        if (col != null) onColumn?.(col);
      }}
    />
  );
}
