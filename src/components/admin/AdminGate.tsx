import { ShieldAlert } from "lucide-react";
import { useIsAdmin } from "@/hooks/useGitHub";

// Wraps an admin-only setting. Admins see the live section; non-admins see a
// static, inert card with a "contact an admin" overlay instead of a hidden
// section — they can see WHAT is configurable, but the interactive internals
// are never mounted, so no admin-only API calls fire for non-admins.
export function AdminGate({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const isAdmin = useIsAdmin();

  if (isAdmin) return <>{children}</>;

  return (
    <div className="relative bg-white rounded-xl border border-stone-200 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
      <p className="text-xs text-stone-400">{description}</p>
      <div className="relative rounded-lg border border-stone-100 bg-stone-50 p-4">
        {/* Faded placeholder rows hint at the hidden controls without
            duplicating any real UI. */}
        <div className="space-y-2 opacity-40" aria-hidden>
          <div className="h-6 rounded bg-stone-200" />
          <div className="h-6 w-2/3 rounded bg-stone-200" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="flex items-start gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 shadow-sm max-w-sm">
            <ShieldAlert size={14} className="mt-0.5 shrink-0 text-stone-500" />
            <p className="text-xs text-stone-600">
              Only organization admins can change this setting. Ask an admin to
              configure it for you.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
