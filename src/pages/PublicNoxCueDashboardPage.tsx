import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, CheckCircle2, ChevronDown, Clock3, ExternalLink, LockKeyhole, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { useParams } from "react-router-dom";
import { Spinner } from "@/components/Spinner";

interface Comparison {
  yesterday: number | null;
  average30d: number | null;
  sampleDays: number;
  history: Array<{ period: string; value: number }>;
}
interface DashboardSource {
  id: string; name: string; environment: string; period: string;
  settings: { collecting: boolean; digestEnabled: boolean; alertsEnabled: boolean; timezone: string; digestTimeLocal: string };
  endpoint: { enabled: boolean; url: string | null; status: "waiting" | "healthy" | "issue"; lastCheckedAt: string | null; statusCode: number | null; latencyMs: number | null; error: string | null };
  metrics: Record<string, number>;
  comparisons: Record<string, Comparison>;
  metricLabels: Record<string, string>;
  features: Array<{ key: string; label: string; status: "waiting" | "healthy" | "issue"; lastResultAt: string | null; lastFailureAt: string | null; lastReason: string | null; successes24h: number; rejections24h: number; failures24h: number }>;
  errors: Array<{
    title: string; errorCode: string | null; component: string | null; firstSeenAt: string; lastSeenAt: string; occurrenceCount: number;
    occurrences: Array<{ id: string; message: string | null; occurredAt: string; receivedAt: string; url: string | null; errorCode: string | null; component: string | null; environment: string | null; fatal: boolean; unhandled: boolean }>;
  }>;
}
interface DashboardData { project: { name: string }; generatedAt: string; sources: DashboardSource[] }
type DashboardTab = "stats" | "alerts";

const STANDARD_LABELS: Record<string, string> = {
  "users.new": "New users", "users.total": "Total users", "users.active.daily": "Daily active",
  "users.active.weekly": "Weekly active", "users.active.monthly": "Monthly active",
  "users.stickiness.dau_mau": "DAU / MAU",
};

function formatValue(key: string, value: number) {
  return key.includes("ratio") || key.endsWith("dau_mau")
    ? `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
    : value.toLocaleString(undefined, { maximumFractionDigits: key.endsWith(".per_user") ? 2 : 0 });
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not checked yet";
}

function Sparkline({ values, issue = false }: { values: number[]; issue?: boolean }) {
  const points = useMemo(() => {
    if (!values.length) return "";
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${32 - ((value - min) / range) * 26}`).join(" ");
  }, [values]);
  return <svg viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true" className="h-12 w-full overflow-visible">
    <path d="M0 32 H100" stroke="currentColor" className="text-white/10" strokeWidth="1" />
    <polyline points={points} fill="none" stroke={issue ? "#fb7185" : "#ef7974"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
  </svg>;
}

function NoxCueBrand({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-3">
    <span className={`grid ${compact ? "size-9 rounded-[11px]" : "size-11 rounded-[14px]"} place-items-center bg-gradient-to-br from-[#fe795d] to-[#9b78f4] text-white shadow-lg shadow-[#9b78f4]/10`}><Activity size={compact ? 17 : 20} strokeWidth={2.25} /></span>
    <div><p className={`${compact ? "text-lg" : "text-xl"} font-display tracking-tight text-white`}><span className="font-bold">Nox</span><span className="font-normal">Cue</span></p>{compact ? null : <p className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-white/40">Product health</p>}</div>
  </div>;
}

function StatusPill({ on, label }: { on: boolean; label: string }) {
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${on ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/5 text-white/45"}`}>{label}: {on ? "On" : "Off"}</span>;
}

export function PublicNoxCueDashboardPage() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<DashboardData | null>(null);
  const [projectName, setProjectName] = useState("NoxCue dashboard");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [activeTab, setActiveTab] = useState<DashboardTab>("stats");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await fetch(`/api/public/cue-dashboards/${encodeURIComponent(slug)}`, { cache: "no-store" });
      const body = await result.json() as DashboardData & { error?: string; projectName?: string };
      if (result.status === 401) {
        setProjectName(body.projectName || "NoxCue dashboard"); setPasswordRequired(true); setData(null); return;
      }
      if (!result.ok) throw new Error(body.error || "This dashboard is unavailable.");
      setData(body); setProjectName(body.project.name); setPasswordRequired(false);
      setSelectedSourceId((current) => body.sources.some((source) => source.id === current) ? current : body.sources[0]?.id ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "This dashboard is unavailable."); }
    finally { setLoading(false); }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const previous = document.title; document.title = `${projectName} · NoxCue`; return () => { document.title = previous; }; }, [projectName]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const result = await fetch(`/api/public/cue-dashboards/${encodeURIComponent(slug)}/login`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
      });
      const body = await result.json() as { error?: string };
      if (!result.ok) throw new Error(body.error || "Could not unlock this dashboard.");
      setPassword(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not unlock this dashboard."); setLoading(false); }
  };

  if (loading && !data) return <main className="flex min-h-screen items-center justify-center bg-[#202024]"><Spinner size="lg" /></main>;
  if (passwordRequired) return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#202024] px-5 py-12 text-stone-100">
    <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(circle_at_15%_10%,rgba(239,121,116,.18)_0,transparent_34%),radial-gradient(circle_at_90%_85%,rgba(155,120,244,.18)_0,transparent_32%)]" />
    <form onSubmit={login} className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#242428]/95 p-7 shadow-2xl shadow-black/25 sm:p-9">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#fe795d] to-[#9b78f4]" />
      <div className="mb-8 flex items-center justify-between gap-4"><NoxCueBrand /><p className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/40">Dashboard</p></div>
      <h1 className="mb-4 font-display text-2xl text-white">{projectName}</h1>
      <div className="mb-5 flex items-start gap-3 rounded-2xl bg-white/[0.04] p-4"><LockKeyhole className="mt-0.5 shrink-0 text-[#ef7974]" size={18} /><p className="text-sm leading-6 text-white/65">Enter the project password to view its read-only product health dashboard.</p></div>
      <label className="text-xs font-medium uppercase tracking-wider text-white/45">Password<input autoFocus type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required className="mt-2 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-base text-white outline-none transition focus:border-[#ef7974] focus:ring-2 focus:ring-[#ef7974]/10" /></label>
      {error ? <p role="alert" className="mt-3 text-sm text-red-300">{error}</p> : null}
      <button disabled={loading || !password} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ef7974] px-4 py-3 text-sm font-semibold text-[#18181b] transition hover:bg-[#f38b86] disabled:opacity-50">{loading ? <Spinner size="sm" /> : <ShieldCheck size={17} />} Open dashboard</button>
      <p className="mt-6 text-center text-xs text-white/35">Read-only access · no account required</p>
    </form>
  </main>;
  if (!data) return <main className="flex min-h-screen items-center justify-center bg-[#202024] px-5 text-white/55"><p>{error || "This dashboard is unavailable."}</p></main>;

  const source = data.sources.find((candidate) => candidate.id === selectedSourceId) ?? data.sources[0];
  return <main className="min-h-screen bg-[#202024] text-white/90">
    <header className="relative overflow-hidden border-b border-white/10 bg-[#242428]">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#fe795d] to-[#9b78f4]" />
      <div className="pointer-events-none absolute inset-0 opacity-50 [background:radial-gradient(circle_at_80%_-20%,rgba(155,120,244,.14),transparent_35%)]" />
      <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="relative"><NoxCueBrand compact /><h1 className="mt-5 font-display text-4xl text-white">{data.project.name}</h1><p className="mt-2 text-sm text-white/50">Completed day {source?.period ?? "—"} · Updated {formatDate(data.generatedAt)}</p></div>
          <div className="relative flex gap-2"><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs text-white/65 hover:border-[#ef7974]/40 hover:bg-[#ef7974]/10 hover:text-[#f5a09c]"><RefreshCw size={14} /> Refresh</button><button onClick={async () => { await fetch(`/api/public/cue-dashboards/${encodeURIComponent(slug)}`, { method: "DELETE" }); setData(null); setPasswordRequired(true); }} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs text-white/65 hover:border-[#ef7974]/40 hover:bg-[#ef7974]/10 hover:text-[#f5a09c]"><LogOut size={14} /> Lock</button></div>
        </div>
        {data.sources.length > 1 ? <div className="relative mt-6 flex flex-wrap gap-2">{data.sources.map((candidate) => <button key={candidate.id} onClick={() => setSelectedSourceId(candidate.id)} className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${candidate.id === source?.id ? "bg-[#ef7974] text-[#18181b]" : "bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/70"}`}>{candidate.environment}</button>)}</div> : null}
      </div>
    </header>
    {!source ? <div className="mx-auto max-w-6xl px-5 py-12 text-white/50">No NoxCue environments are linked to this project.</div> : <Dashboard key={source.id} source={source} activeTab={activeTab} onTabChange={setActiveTab} />}
    <footer className="border-t border-white/10 px-5 py-7 text-center text-xs text-white/35"><span className="font-display"><strong className="text-white/55">Nox</strong>Cue</span> · protected through <span className="font-display"><strong className="text-white/55">Nox</strong>Connect</span></footer>
  </main>;
}

function Dashboard({ source, activeTab, onTabChange }: { source: DashboardSource; activeTab: DashboardTab; onTabChange: (tab: DashboardTab) => void }) {
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const metricEntries = Object.entries(source.metrics);
  const featureIssues = source.features.filter((feature) => feature.status === "issue");
  const healthyFeatures = source.features.filter((feature) => feature.status === "healthy").length;
  return <div className="mx-auto max-w-6xl space-y-8 px-5 py-9 sm:px-8">
    <nav role="tablist" aria-label="Dashboard sections" className="flex border-b border-white/10">
      <button id="noxcue-stats-tab" type="button" role="tab" aria-selected={activeTab === "stats"} aria-controls="noxcue-stats-panel" onClick={() => onTabChange("stats")} className={`relative flex items-center gap-2 px-1 pb-3 pr-6 text-sm font-medium transition ${activeTab === "stats" ? "text-white after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-[#ef7974]" : "text-white/40 hover:text-white/70"}`}><Activity size={15} /> Stats</button>
      <button id="noxcue-alerts-tab" type="button" role="tab" aria-selected={activeTab === "alerts"} aria-controls="noxcue-alerts-panel" onClick={() => onTabChange("alerts")} className={`relative flex items-center gap-2 px-1 pb-3 pr-6 text-sm font-medium transition ${activeTab === "alerts" ? "text-white after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-[#ef7974]" : "text-white/40 hover:text-white/70"}`}><Bell size={15} /> Alerts{featureIssues.length || source.endpoint.status === "issue" ? <span className="size-1.5 rounded-full bg-red-400" aria-hidden="true" title="Active issue" /> : null}</button>
    </nav>
    {activeTab === "stats" ? <section id="noxcue-stats-panel" role="tabpanel" aria-labelledby="noxcue-stats-tab"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ef7974] capitalize">{source.environment}</p><h2 className="mt-1 font-display text-2xl text-white">Daily pulse</h2></div><div className="flex flex-wrap gap-2"><StatusPill on={source.settings.collecting} label="Collection" /><StatusPill on={source.settings.digestEnabled} label="Digest" /></div></div>
      {metricEntries.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{metricEntries.map(([key, value]) => {
        const comparison = source.comparisons[key]; const yesterday = comparison?.yesterday; const delta = yesterday === null || yesterday === undefined ? null : value - yesterday;
        return <article key={key} className="rounded-2xl border border-white/10 bg-[#242428] p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-white/50">{source.metricLabels[key] ?? STANDARD_LABELS[key] ?? key}</p><p className="mt-1 text-3xl font-semibold tracking-tight text-white">{formatValue(key, value)}</p></div><p className={`text-xs font-medium ${delta === null || delta === 0 ? "text-white/35" : delta > 0 ? "text-emerald-300" : "text-amber-300"}`}>{delta === null ? "No comparison" : delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${formatValue(key, delta)} vs yesterday`}</p></div><div className="mt-4"><Sparkline values={comparison?.history.map((point) => point.value) ?? []} /></div><p className="mt-1 text-[11px] text-white/35">30d average {comparison?.average30d === null || comparison?.average30d === undefined ? "—" : formatValue(key, comparison.average30d)}</p></article>;
      })}</div> : <div className="rounded-2xl border border-dashed border-white/15 p-6 text-sm text-white/50">No completed-day statistics yet.</div>}
    </section> : <div id="noxcue-alerts-panel" role="tabpanel" aria-labelledby="noxcue-alerts-tab" className="space-y-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ef7974] capitalize">{source.environment}</p><h2 className="mt-1 font-display text-2xl text-white">Alert health</h2></div><StatusPill on={source.settings.alertsEnabled} label="Alerts" /></div>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-white/10 bg-[#242428] p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">Endpoint</p><h2 className="mt-1 font-display text-xl text-white">Availability</h2></div><HealthStatus status={source.endpoint.enabled ? source.endpoint.status : "off"} /></div>{source.endpoint.enabled ? <div className="mt-5 space-y-2 text-sm text-white/75"><p className="break-all">{source.endpoint.url}</p><p className="text-xs text-white/35">{formatDate(source.endpoint.lastCheckedAt)}{source.endpoint.statusCode ? ` · HTTP ${source.endpoint.statusCode}` : ""}{source.endpoint.latencyMs !== null ? ` · ${source.endpoint.latencyMs} ms` : ""}</p>{source.endpoint.error ? <p className="flex gap-2 rounded-xl bg-red-400/10 p-3 text-xs text-red-200"><AlertTriangle size={14} className="shrink-0" />{source.endpoint.error}</p> : null}</div> : <p className="mt-5 text-sm text-white/35">Endpoint monitoring is not enabled.</p>}</section>
      <section className="rounded-2xl border border-white/10 bg-[#242428] p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">Features</p><h2 className="mt-1 font-display text-xl text-white">User journeys</h2></div><HealthStatus status={featureIssues.length ? "issue" : healthyFeatures ? "healthy" : "waiting"} /></div><div className="mt-5 grid grid-cols-3 gap-2 text-center"><MiniStat label="Healthy" value={healthyFeatures} /><MiniStat label="Issues" value={featureIssues.length} /><MiniStat label="Waiting" value={source.features.length - healthyFeatures - featureIssues.length} /></div>{featureIssues.length ? <div className="mt-4 space-y-2">{featureIssues.map((feature) => <div key={feature.key} className="rounded-xl bg-red-400/10 p-3"><p className="text-sm font-medium text-red-200">{feature.label}</p><p className="mt-1 text-xs text-red-200/70">{feature.lastReason ?? "Critical failure"} · {feature.failures24h} failure{feature.failures24h === 1 ? "" : "s"} in 24h</p></div>)}</div> : <p className="mt-4 text-xs text-white/35">No feature incident is currently open.</p>}</section>
    </div>
    <section><div className="mb-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ef7974]">Errors</p><h2 className="mt-1 font-display text-2xl text-white">Recently observed</h2></div>{source.errors.length ? <div className="grid gap-3 sm:grid-cols-2">{source.errors.map((item, index) => {
      const itemKey = `${item.title}:${item.errorCode ?? ""}:${index}`;
      const expanded = expandedError === itemKey;
      return <article key={itemKey} className={`rounded-2xl border bg-[#242428] transition ${expanded ? "border-[#ef7974]/35 sm:col-span-2" : "border-white/10"}`}>
        <button type="button" aria-expanded={expanded} aria-controls={`error-log-${index}`} onClick={() => setExpandedError(expanded ? null : itemKey)} className="w-full p-4 text-left">
          <div className="flex items-start justify-between gap-3"><p className="font-medium text-white/85">{item.title}</p><span className="shrink-0 rounded-full bg-white/5 px-2 py-1 text-xs text-white/45">{item.occurrenceCount}×</span></div>
          <p className="mt-2 text-xs text-white/35">{[item.component, item.errorCode].filter(Boolean).join(" · ") || "No error code"}</p>
          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-white/35"><span className="flex items-center gap-1.5"><Clock3 size={12} /> Last seen {formatDate(item.lastSeenAt)}</span><span className="flex items-center gap-1 text-[#ef9995]">{expanded ? "Hide logs" : item.occurrences.length ? `View ${item.occurrences.length} log${item.occurrences.length === 1 ? "" : "s"}` : "View logs"}<ChevronDown size={13} className={`transition-transform ${expanded ? "rotate-180" : ""}`} /></span></div>
        </button>
        {expanded ? <div id={`error-log-${index}`} className="border-t border-white/10 px-4 pb-4 pt-3">
          {item.occurrences.length ? <div className="space-y-3">{item.occurrences.map((log, logIndex) => <div key={log.id} className="rounded-xl bg-[#1c1c20] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium text-white/70">Occurrence {item.occurrenceCount - logIndex}</p><p className="text-[11px] text-white/35">{formatDate(log.occurredAt)}</p></div>
            {log.message ? <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-xs leading-5 text-white/70">{log.message}</pre> : <p className="mt-3 text-xs italic text-white/35">No error message was supplied.</p>}
            <div className="mt-3 flex flex-wrap gap-2">{[log.component, log.errorCode, log.environment].filter(Boolean).map((value) => <span key={value} className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-white/45">{value}</span>)}{log.fatal ? <span className="rounded-full bg-red-400/10 px-2 py-1 text-[10px] text-red-300">Fatal</span> : null}{log.unhandled ? <span className="rounded-full bg-red-400/10 px-2 py-1 text-[10px] text-red-300">Unhandled</span> : null}</div>
            {log.url ? <a href={log.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex max-w-full items-center gap-1 text-[11px] text-[#ef9995] hover:text-[#f4b1ae]"><span className="truncate">{log.url}</span><ExternalLink size={11} className="shrink-0" /></a> : null}
          </div>)}</div> : <p className="text-xs text-white/35">Detailed logs were not retained for this older error group.</p>}
          {item.occurrenceCount > item.occurrences.length ? <p className="mt-3 text-[11px] text-white/35">Showing the latest {item.occurrences.length} retained occurrence{item.occurrences.length === 1 ? "" : "s"} of {item.occurrenceCount} total.</p> : null}
        </div> : null}
      </article>;
    })}</div> : <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-5 text-sm text-emerald-200"><span className="inline-flex items-center gap-2"><CheckCircle2 size={16} /> No errors have been recorded for this environment.</span></div>}</section>
    </div>}
  </div>;
}

function MiniStat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-white/[0.04] px-3 py-3"><p className="text-xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-white/35">{label}</p></div>; }
function HealthStatus({ status }: { status: string }) {
  const view = status === "healthy" ? ["Healthy", "text-emerald-300 bg-emerald-400/10"] : status === "issue" ? ["Issue", "text-red-300 bg-red-400/10"] : status === "off" ? ["Off", "text-white/35 bg-white/5"] : ["Waiting", "text-amber-300 bg-amber-400/10"];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${view[1]}`}>{view[0]}</span>;
}
