import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSlackChannels, fetchSlackStatus } from "@/lib/slack-api";

// Shared Slack queries used by the connection card and every per-tool route
// field. React Query dedupes the ["slack-status"] / ["slack-channels"] keys,
// so multiple consumers mount one network request per key.
export function useSlackChannels(connectionId?: string) {
  const status = useQuery({
    queryKey: ["slack-status"],
    queryFn: () => fetchSlackStatus(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const channels = useQuery({
    queryKey: ["slack-channels", connectionId ?? "default"],
    queryFn: () => fetchSlackChannels(connectionId).then((r) => r.channels),
    enabled: !!status.data?.connected && !!status.data?.canConfigure,
    staleTime: 60_000,
  });

  const channelOptions = useMemo(() => {
    const list = Array.isArray(channels.data) ? channels.data : [];
    const opts = list.map((c) => ({
      value: c.id,
      label: `${c.is_private ? "🔒 " : "#"}${c.name}`,
    }));
    return [{ value: "", label: "— No channel —" }, ...opts];
  }, [channels.data]);

  return { status, channels, channelOptions };
}
