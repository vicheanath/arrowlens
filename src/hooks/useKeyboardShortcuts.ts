import { useEffect, useCallback } from "react";

type KeyHandler = (e: KeyboardEvent) => void;

interface ShortcutDef {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: KeyHandler;
}

export function useKeyboardShortcuts(shortcuts: ShortcutDef[]) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      for (const s of shortcuts) {
        const metaMatch = s.meta ? (e.metaKey || e.ctrlKey) : true;
        const ctrlMatch = s.ctrl ? e.ctrlKey : true;
        const shiftMatch = s.shift ? e.shiftKey : !s.shift || !e.shiftKey;
        const altMatch = s.alt ? e.altKey : true;
        const keyMatch = e.key.toLowerCase() === s.key.toLowerCase();

        if (keyMatch && metaMatch && ctrlMatch && shiftMatch && altMatch) {
          e.preventDefault();
          s.handler(e);
          break;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
