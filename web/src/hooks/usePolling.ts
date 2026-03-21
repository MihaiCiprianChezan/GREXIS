import { useEffect, useRef } from "react";

export function usePolling(callback: () => void, intervalMs: number) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") {
        savedCallback.current();
      }
    };
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
