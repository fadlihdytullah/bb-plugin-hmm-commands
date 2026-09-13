import { useCallback, useEffect, useState } from "react";
import {
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { Command, rpcContract } from "../server";

const COMMANDS_CHANGED = "commands-changed";

export function useCommands() {
  const rpc = useRpc<typeof rpcContract>();
  const connectionState = useRealtimeConnectionState();
  const [commands, setCommands] = useState<readonly Command[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await rpc.call("commands_list", {});
      setCommands(result.commands);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsLoading(false);
    }
  }, [rpc]);

  useEffect(() => void refresh(), [refresh]);
  useRealtime(COMMANDS_CHANGED, () => void refresh());
  useEffect(() => {
    if (connectionState === "connected") void refresh();
  }, [connectionState, refresh]);

  const create = useCallback(
    async (name: string, prompt: string) => {
      const command = await rpc.call("commands_create", { name, prompt });
      await refresh();
      return command;
    },
    [refresh, rpc],
  );

  const remove = useCallback(
    async (commandId: string) => {
      await rpc.call("commands_delete", { commandId });
      await refresh();
    },
    [refresh, rpc],
  );

  return { commands, isLoading, error, refresh, create, remove };
}
