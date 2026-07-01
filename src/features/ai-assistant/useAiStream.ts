import { useCallback, useState } from "react";
import { newRequestId, subscribeAiStream } from "../../services/aiService";
import { errorToMessage } from "../../utils/errors";

/**
 * Drives a streaming AI command: subscribes to delta events, accumulates the
 * live text, and resolves with the command's final return value.
 */
export function useAiStream() {
  const [text, setText] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(invoke: (requestId: string) => Promise<T>): Promise<T | null> => {
      setText("");
      setError(null);
      setIsRunning(true);
      const requestId = newRequestId();
      let unlisten: (() => void) | null = null;
      try {
        unlisten = await subscribeAiStream(requestId, (delta) => {
          setText((current) => current + delta);
        });
        return await invoke(requestId);
      } catch (e) {
        setError(errorToMessage(e));
        return null;
      } finally {
        if (unlisten) unlisten();
        setIsRunning(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setText("");
    setError(null);
  }, []);

  return { text, setText, isRunning, error, run, reset };
}
