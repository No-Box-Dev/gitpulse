import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, LockKeyhole, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
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
  errors: Array<{ title: string; errorCode: string | null; component: string | null; firstSeenAt: string; lastSeenAt: string; occurrenceCount: number }>;
}
interface DashboardData { project: { name: string }; generatedAt: string; sources: DashboardSource[] }

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
    <polyline points={points} fill="none" stroke={issue ? "#fb7185" : "#60a5fa"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
  </svg>;
}

function StatusPill({ on, label }: { on: boolean; label: string }) {
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${on ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/5 text-stone-400"}`}>{label}: {on ? "On" : "Off"}</span>;
}

export function PublicNoxCueDashboardPage() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<DashboardData | null>(null);
  const [projectName, setProjectName] = useState("NoxCue dashboard");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
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

  if (loading && !data) return <main className="flex min-h-screen items-center justify-center bg-[#101419]"><Spinner size="lg" /></main>;
  if (passwordRequired) return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#101419] px-5 py-12 text-stone-100">
    <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(circle_at_15%_10%,#163a5b_0,transparent_34%),radial-gradient(circle_at_90%_85%,#214b3b_0,transparent_32%)]" />
    <form onSubmit={login} className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#181d24]/95 p-7 shadow-2xl sm:p-9">
      <div className="mb-8 flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-blue-500 text-white"><Activity size={21} /></span><div><p className="text-xs uppercase tracking-[0.28em] text-stone-400">NoxCue dashboard</p><h1 className="mt-1 font-display text-2xl">{projectName}</h1></div></div>
      <div className="mb-5 flex items-start gap-3 rounded-2xl bg-white/[0.04] p-4"><LockKeyhole className="mt-0.5 shrink-0 text-blue-300" size={18} /><p className="text-sm leading-6 text-stone-300">Enter the project password to view its read-only product health dashboard.</p></div>
      <label className="text-xs font-medium uppercase tracking-wider text-stone-400">Password<input autoFocus type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required className="mt-2 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-base text-white outline-none transition focus:border-blue-400" /></label>
      {error ? <p role="alert" className="mt-3 text-sm text-red-300">{error}</p> : null}
      <button disabled={loading || !password} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:opacity-50">{loading ? <Spinner size="sm" /> : <ShieldCheck size={17} />} Open dashboard</button>
      <p className="mt-6 text-center text-xs text-stone-500">Read-only access · no account required</p>
    </form>
  </main>;
  if (!data) return <main className="flex min-h-screen items-center justify-center bg-[#101419] px-5 text-stone-400"><p>{error || "This dashboard is unavailable."}</p></main>;

  const source = data.sources.find((candidate) => candidate.id === selectedSourceId) ?? data.sources[0];
  return <main className="min-h-screen bg-[#101419] text-stone-100">
    <header className="border-b border-white/10 bg-[#141a21]">
      <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-blue-300"><Activity size={14} /> NoxCue product health</p><h1 className="mt-3 font-display text-4xl">{data.project.name}</h1><p className="mt-2 text-sm text-stone-400">Completed day {source?.period ?? "—"} · Updated {formatDate(data.generatedAt)}</p></div>
          <div className="flex gap-2"><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs text-stone-300 hover:bg-white/5"><RefreshCw size={14} /> Refresh</button><button onClick={async () => { await fetch(`/api/public/cue-dashboards/${encodeURIComponent(slug)}`, { method: "DELETE" }); setData(null); setPasswordRequired(true); }} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs text-stone-300 hover:bg-white/5"><LogOut size={14} /> Lock</button></div>
        </div>
        {data.sources.length > 1 ? <div className="mt-6 flex flex-wrap gap-2">{data.sources.map((candidate) => <button key={candidate.id} onClick={() => setSelectedSourceId(candidate.id)} className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${candidate.id === source?.id ? "bg-blue-500 text-white" : "bg-white/5 text-stone-400 hover:bg-white/10"}`}>{candidate.environment}</button>)}</div> : null}
      </div>
    </header>
    {!source ? <div className="mx-auto max-w-6xl px-5 py-12 text-stone-400">No NoxCue environments are linked to this project.</div> : <Dashboard source={source} />}
    <footer className="border-t border-white/10 px-5 py-7 text-center text-xs text-stone-500">Protected read-only project view powered by NoxCue</footer>
  </main>;
}

function Dashboard({ source }: { source: DashboardSource }) {
  const metricEntries = Object.entries(source.metrics);
  const featureIssues = source.features.filter((feature) => feature.status === "issue");
  const healthyFeatures = source.features.filter((feature) => feature.status === "healthy").length;
  return <div className="mx-auto max-w-6xl space-y-8 px-5 py-9 sm:px-8">
    <section><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 capitalize">{source.environment}</p><h2 className="mt-1 font-display text-2xl">Daily pulse</h2></div><div className="flex flex-wrap gap-2"><StatusPill on={source.settings.collecting} label="Collection" /><StatusPill on={source.settings.digestEnabled} label="Digest" /><StatusPill on={source.settings.alertsEnabled} label="Alerts" /></div></div>
      {metricEntries.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{metricEntries.map(([key, value]) => {
        const comparison = source.comparisons[key]; const yesterday = comparison?.yesterday; const delta = yesterday === null || yesterday === undefined ? null : value - yesterday;
        return <article key={key} className="rounded-2xl border border-white/10 bg-[#181e26] p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-stone-400">{source.metricLabels[key] ?? STANDARD_LABELS[key] ?? key}</p><p className="mt-1 text-3xl font-semibold tracking-tight">{formatValue(key, value)}</p></div><p className={`text-xs font-medium ${delta === null || delta === 0 ? "text-stone-500" : delta > 0 ? "text-emerald-300" : "text-amber-300"}`}>{delta === null ? "No comparison" : delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${formatValue(key, delta)} vs yesterday`}</p></div><div className="mt-4"><Sparkline values={comparison?.history.map((point) => point.value) ?? []} /></div><p className="mt-1 text-[11px] text-stone-500">30d average {comparison?.average30d === null || comparison?.average30d === undefined ? "—" : formatValue(key, comparison.average30d)}</p></article>;
      })}</div> : <div className="rounded-2xl border border-dashed border-white/15 p-6 text-sm text-stone-400">No completed-day statistics yet.</div>}
    </section>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-white/10 bg-[#181e26] p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Endpoint</p><h2 className="mt-1 font-display text-xl">Availability</h2></div><HealthStatus status={source.endpoint.enabled ? source.endpoint.status : "off"} /></div>{source.endpoint.enabled ? <div className="mt-5 space-y-2 text-sm text-stone-300"><p className="break-all">{source.endpoint.url}</p><p className="text-xs text-stone-500">{formatDate(source.endpoint.lastCheckedAt)}{source.endpoint.statusCode ? ` · HTTP ${source.endpoint.statusCode}` : ""}{source.endpoint.latencyMs !== null ? ` · ${source.endpoint.latencyMs} ms` : ""}</p>{source.endpoint.error ? <p className="flex gap-2 rounded-xl bg-red-400/10 p-3 text-xs text-red-200"><AlertTriangle size={14} className="shrink-0" />{source.endpoint.error}</p> : null}</div> : <p className="mt-5 text-sm text-stone-500">Endpoint monitoring is not enabled.</p>}</section>
      <section className="rounded-2xl border border-white/10 bg-[#181e26] p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Features</p><h2 className="mt-1 font-display text-xl">User journeys</h2></div><HealthStatus status={featureIssues.length ? "issue" : healthyFeatures ? "healthy" : "waiting"} /></div><div className="mt-5 grid grid-cols-3 gap-2 text-center"><MiniStat label="Healthy" value={healthyFeatures} /><MiniStat label="Issues" value={featureIssues.length} /><MiniStat label="Waiting" value={source.features.length - healthyFeatures - featureIssues.length} /></div>{featureIssues.length ? <div className="mt-4 space-y-2">{featureIssues.map((feature) => <div key={feature.key} className="rounded-xl bg-red-400/10 p-3"><p className="text-sm font-medium text-red-200">{feature.label}</p><p className="mt-1 text-xs text-red-200/70">{feature.lastReason ?? "Critical failure"} · {feature.failures24h} failure{feature.failures24h === 1 ? "" : "s"} in 24h</p></div>)}</div> : <p className="mt-4 text-xs text-stone-500">No feature incident is currently open.</p>}</section>
    </div>
    <section><div className="mb-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Errors</p><h2 className="mt-1 font-display text-2xl">Recently observed</h2></div>{source.errors.length ? <div className="grid gap-3 sm:grid-cols-2">{source.errors.map((item, index) => <article key={`${item.title}:${index}`} className="rounded-2xl border border-white/10 bg-[#181e26] p-4"><div className="flex items-start justify-between gap-3"><p className="font-medium text-stone-200">{item.title}</p><span className="rounded-full bg-white/5 px-2 py-1 text-xs text-stone-400">{item.occurrenceCount}×</span></div><p className="mt-2 text-xs text-stone-500">{[item.component, item.errorCode].filter(Boolean).join(" · ") || "No error code"}</p><p className="mt-3 flex items-center gap-1.5 text-[11px] text-stone-500"><Clock3 size={12} /> Last seen {formatDate(item.lastSeenAt)}</p></article>)}</div> : <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-5 text-sm text-emerald-200"><span className="inline-flex items-center gap-2"><CheckCircle2 size={16} /> No errors have been recorded for this environment.</span></div>}</section>
  </div>;
}

function MiniStat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-white/[0.04] px-3 py-3"><p className="text-xl font-semibold">{value}</p><p className="mt-1 text-[11px] text-stone-500">{label}</p></div>; }
function HealthStatus({ status }: { status: string }) {
  const view = status === "healthy" ? ["Healthy", "text-emerald-300 bg-emerald-400/10"] : status === "issue" ? ["Issue", "text-red-300 bg-red-400/10"] : status === "off" ? ["Off", "text-stone-500 bg-white/5"] : ["Waiting", "text-amber-300 bg-amber-400/10"];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${view[1]}`}>{view[0]}</span>;
}
