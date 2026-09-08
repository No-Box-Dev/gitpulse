import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ArrowLeft, Building2, LogOut, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { fetchOperatorUsage, type OperatorServiceUsage } from "@/lib/operator";
import { Spinner } from "@/components/Spinner";

const SERVICE_NAMES: Record<OperatorServiceUsage["id"], string> = {
  noxconnect: "NoxConnect",
  noxticket: "NoxTicket",
  noxfeed: "NoxFeed",
  noxspot: "NoxSpot",
  noxcue: "NoxCue",
};

function formatDate(value: string | null) {
  if (!value) return "No activity yet";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function OperatorPage() {
  const { logout } = useAuth();
  const usage = useQuery({
    queryKey: ["operator", "usage"],
    queryFn: fetchOperatorUsage,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-accent">
              <ShieldCheck size={14} /> Internal operator
            </div>
            <h1 className="mt-1 text-xl font-semibold">Nox business overview</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-600 hover:bg-stone-50">
              <ArrowLeft size={15} /> Workspaces
            </Link>
            <button type="button" onClick={logout} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-stone-500 hover:bg-stone-100">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-7 px-5 py-7">
        {usage.isLoading ? <div className="flex min-h-72 items-center justify-center"><Spinner className="h-6 w-6 text-accent" /></div> : null}
        {usage.isError ? (
          <section className="rounded-xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-semibold text-red-900">Operator access unavailable</h2>
            <p className="mt-2 text-sm text-red-700">{usage.error instanceof Error ? usage.error.message : "Could not load the business overview."}</p>
          </section>
        ) : null}
        {usage.data ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Organizations" value={usage.data.totals.organizations} detail={`${usage.data.totals.activeOrganizations30d} active in 30 days`} icon={<Building2 size={17} />} />
              <Metric label="Known accounts" value={usage.data.totals.knownAccounts} detail="Unique GitHub accounts" icon={<Users size={17} />} />
              <Metric label="Monthly active" value={usage.data.totals.activeAccounts30d} detail="Across authenticated workspaces" icon={<Users size={17} />} />
              <Metric label="Suspended" value={usage.data.totals.suspendedOrganizations} detail="Organizations currently blocked" icon={<ShieldCheck size={17} />} />
            </section>

            <section>
              <div className="mb-3">
                <h2 className="text-base font-semibold">Service adoption</h2>
                <p className="mt-1 text-sm text-stone-500">Enabled organizations and available lifecycle usage by product.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {usage.data.services.map((service) => <ServiceCard key={service.id} service={service} />)}
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <div className="border-b border-stone-100 px-5 py-4">
                <h2 className="text-base font-semibold">Organizations</h2>
                <p className="mt-1 text-sm text-stone-500">Commercial account health without repository, issue, prompt, or feed content.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-left text-sm">
                  <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-400">
                    <tr><th className="px-5 py-3">Organization</th><th className="px-4 py-3">Accounts</th><th className="px-4 py-3">30-day active</th><th className="px-4 py-3">Services</th><th className="px-5 py-3">Last activity</th></tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {usage.data.organizations.map((org) => (
                      <tr key={org.id} className={org.suspendedAt ? "bg-red-50/50" : undefined}>
                        <td className="px-5 py-4 font-medium">{org.login}{org.suspendedAt ? <span className="ml-2 text-xs text-red-600">Suspended</span> : null}</td>
                        <td className="px-4 py-4 tabular-nums">{org.knownAccounts}</td>
                        <td className="px-4 py-4 tabular-nums">{org.activeAccounts30d}</td>
                        <td className="px-4 py-4"><div className="flex flex-wrap gap-1">{org.enabledServices.map((id) => <span key={id} className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600">{SERVICE_NAMES[id]}</span>)}</div></td>
                        <td className="px-5 py-4 text-xs text-stone-500">{formatDate(org.lastActiveAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <p className="text-xs text-stone-400">Updated {formatDate(usage.data.generatedAt)} · {usage.data.privacy.note} Customer content is never included.</p>
          </>
        ) : null}
      </main>
    </div>
  );
}

function Metric({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: ReactNode }) {
  return <div className="rounded-xl border border-stone-200 bg-white p-5"><div className="flex items-center gap-2 text-sm text-stone-500">{icon}{label}</div><div className="mt-3 text-3xl font-semibold tabular-nums">{value}</div><p className="mt-1 text-xs text-stone-400">{detail}</p></div>;
}

function ServiceCard({ service }: { service: OperatorServiceUsage }) {
  return (
    <article className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{SERVICE_NAMES[service.id]}</h3><span className="rounded-full bg-accent/10 px-2 py-1 text-xs font-medium text-accent">{service.enabledOrganizations} orgs</span></div>
      {service.users ? <div className="mt-5 grid grid-cols-4 gap-2 text-center"><UsageNumber label="Total" value={service.users.total} /><UsageNumber label="DAU" value={service.users.daily} /><UsageNumber label="WAU" value={service.users.weekly} /><UsageNumber label="MAU" value={service.users.monthly} /></div> : <div className="mt-5 rounded-lg border border-dashed border-stone-200 p-4 text-xs text-stone-500">Lifecycle telemetry is not connected for this product yet.</div>}
      <p className="mt-4 text-xs text-stone-400">{service.telemetryConnected ? `Last signal: ${formatDate(service.lastEventAt)}` : "Adoption is currently based on workspace configuration."}</p>
    </article>
  );
}

function UsageNumber({ label, value }: { label: string; value: number }) {
  return <div><div className="text-xl font-semibold tabular-nums">{value}</div><div className="mt-1 text-[10px] uppercase tracking-wide text-stone-400">{label}</div></div>;
}
