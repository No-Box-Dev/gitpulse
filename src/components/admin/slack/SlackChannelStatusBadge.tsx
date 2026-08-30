import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import type { SlackChannelStatus } from "@/lib/slack-api";
import { actionableSlackFeedback } from "@/lib/slack-feedback";

export function SlackChannelStatusBadge({ status }: { status?: SlackChannelStatus }) {
  if (status?.status === "verified") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700"
        title={status.lastDeliveredAt ? `Last delivered ${new Date(status.lastDeliveredAt).toLocaleString()}` : "Delivery verified"}
      >
        <CheckCircle2 size={11} /> Verified
      </span>
    );
  }
  if (status?.status === "issue") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
        title={actionableSlackFeedback(status.lastError, "Review the workspace and channel, then send a test message.")}
      >
        <AlertTriangle size={11} /> Needs action
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-500" title="Choose this channel and send a test message to verify delivery.">
      <Circle size={10} /> Test required
    </span>
  );
}
