import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ExternalLink, GitMerge, Link2, LockKeyhole, LogOut, MessageSquareText, Radio, ShieldCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useParams } from "react-router-dom";
import { Spinner } from "@/components/Spinner";

interface Issue {
  number: number;
  title: string;
  state: string;
  author: { login: string; avatarUrl: string | null } | null;
  labels: Array<{ name?: string; color?: string } | string>;
  updatedAt: string;
  closedAt: string | null;
  url: string;
}

interface Merge {
  number: number;
  title: string;
  mergedAt: string;
  url: string;
  author: { login: string; avatarUrl: string | null } | null;
  linkedIssues: Array<Pick<Issue, "number" | "title" | "state"> & {
    description: string | null;
    submittedBy: string | null;
    screenshotUrl: string | null;
  }>;
  post: string | null;
  technicalSummary: string | null;
  releaseNotes: string | null;
}

interface PortalData {
  project: { name: string; repo: string };
  counts: { open: number; closed: number; merges: number };
  issues: Issue[];
  timeline: Merge[];
}

function formatDate(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function labelName(label: Issue["labels"][number]): string {
  return typeof label === "string" ? label : label.name ?? "";
}

export function PublicProjectSharePage() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<PortalData | null>(null);
  const [projectName, setProjectName] = useState("Shared project");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/public/project-shares/${encodeURIComponent(slug)}`, { cache: "no-store" });
      const body = await response.json() as PortalData & { error?: string; projectName?: string };
      if (response.status === 401) {
        setProjectName(body.projectName || "Shared project");
        setPasswordRequired(true);
        setData(null);
        return;
      }
      if (!response.ok) throw new Error(body.error || "This project portal is unavailable.");
      setData(body);
      setProjectName(body.project.name);
      setPasswordRequired(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This project portal is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${projectName} · NoxSpot portal`;
    return () => { document.title = previousTitle; };
  }, [projectName]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/public/project-shares/${encodeURIComponent(slug)}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not unlock this portal.");
      setPassword("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not unlock this portal.");
      setLoading(false);
    }
  };

  if (loading && !data) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f6f3e8]"><Spinner size="lg" /></main>;
  }

  if (passwordRequired) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#171817] px-5 py-12 text-stone-100">
        <div className="pointer-events-none absolute inset-0 opacity-50 [background:radial-gradient(circle_at_20%_10%,#315c45_0,transparent_32%),radial-gradient(circle_at_85%_85%,#59362c_0,transparent_35%)]" />
        <form onSubmit={login} className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#222321]/95 p-7 shadow-2xl sm:p-9">
          <div className="mb-8 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#d53a12] text-white"><Radio size={21} /></span>
            <div><p className="text-xs uppercase tracking-[0.28em] text-stone-400">NoxSpot portal</p><h1 className="mt-1 font-display text-2xl">{projectName}</h1></div>
          </div>
          <div className="mb-5 flex items-start gap-3 rounded-2xl bg-white/[0.04] p-4">
            <LockKeyhole className="mt-0.5 shrink-0 text-[#ff795d]" size={18} />
            <p className="text-sm leading-6 text-stone-300">Enter the project password to view its read-only issue and release timeline.</p>
          </div>
          <label className="text-xs font-medium uppercase tracking-wider text-stone-400">
            Password
            <input autoFocus type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required className="mt-2 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-base text-white outline-none transition focus:border-[#ff795d]" />
          </label>
          {error ? <p role="alert" className="mt-3 text-sm text-red-300">{error}</p> : null}
          <button disabled={loading || !password} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#d53a12] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#ed461b] disabled:opacity-50">
            {loading ? <Spinner size="sm" /> : <ShieldCheck size={17} />} Open project
          </button>
          <p className="mt-6 text-center text-xs text-stone-500">Read-only access · no account required</p>
        </form>
      </main>
    );
  }

  if (!data) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f6f3e8] px-5"><p className="max-w-md text-center text-stone-600">{error || "This project portal is unavailable."}</p></main>;
  }

  const openIssues = data.issues.filter((issue) => issue.state === "open");
  const closedIssues = data.issues.filter((issue) => issue.state === "closed");

  return (
    <main className="min-h-screen bg-[#f6f3e8] text-[#191a18]">
      <header className="border-b border-black/10 bg-[#c92e08] text-white">
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-11">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/70"><Radio size={14} /> NoxSpot project portal</p>
              <h1 className="mt-3 font-display text-4xl leading-none sm:text-5xl">{data.project.name}</h1>
              <p className="mt-3 font-mono text-sm text-white/70">{data.project.repo}</p>
            </div>
            <button
              onClick={async () => {
                await fetch(`/api/public/project-shares/${encodeURIComponent(slug)}`, { method: "DELETE" });
                setData(null); setPasswordRequired(true);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-2 text-xs font-medium hover:bg-white/10"
            ><LogOut size={14} /> Lock portal</button>
          </div>
          <div className="mt-8 grid max-w-xl grid-cols-3 gap-2">
            {[{ label: "Open issues", value: data.counts.open }, { label: "Closed issues", value: data.counts.closed }, { label: "Merges", value: data.counts.merges }].map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-black/15 px-4 py-3"><p className="font-display text-2xl">{stat.value}</p><p className="mt-0.5 text-[11px] text-white/65">{stat.label}</p></div>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)] lg:py-14">
        <section>
          <div className="mb-5 flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c92e08]">NoxSpot</p><h2 className="mt-1 font-display text-3xl">Issues</h2></div><p className="text-xs text-stone-500">Open and resolved</p></div>
          <IssueGroup title="Open" issues={openIssues} total={data.counts.open} empty="No open issues." />
          <div className="mt-8"><IssueGroup title="Closed" issues={closedIssues} total={data.counts.closed} empty="No closed issues yet." /></div>
        </section>

        <section>
          <div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#34734c]">NoxFeed</p><h2 className="mt-1 font-display text-3xl">Release timeline</h2></div>
          <div className="relative space-y-5 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-stone-300">
            {data.timeline.length === 0 ? <p className="rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-500">No merges recorded yet.</p> : data.timeline.map((merge) => <TimelineEntry key={merge.number} merge={merge} />)}
          </div>
        </section>
      </div>
      <footer className="border-t border-black/10 px-5 py-7 text-center text-xs text-stone-500">Protected read-only project view powered by NoxSpot + NoxFeed</footer>
    </main>
  );
}

function IssueGroup({ title, issues, total, empty }: { title: string; issues: Issue[]; total: number; empty: string }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">{title} <span className="ml-1 text-stone-400">{total}</span></h3>
      <div className="space-y-2">
        {issues.length === 0 ? <p className="rounded-2xl border border-dashed border-stone-300 p-5 text-sm text-stone-500">{empty}</p> : issues.map((issue) => (
          <article id={`issue-${issue.number}`} key={issue.number} className="group scroll-mt-5 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start gap-3">
              <span className={`mt-1 size-2.5 shrink-0 rounded-full ${issue.state === "open" ? "bg-[#d53a12]" : "bg-[#34734c]"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3"><h4 className="font-medium leading-5">{issue.title}</h4>{issue.url ? <a href={issue.url} target="_blank" rel="noreferrer" className="text-stone-400 hover:text-[#c92e08]" aria-label={`Open issue ${issue.number}`}><ExternalLink size={14} /></a> : null}</div>
                <p className="mt-1 text-xs text-stone-500">#{issue.number} · {issue.author?.login ?? "Unknown"} · {formatDate(issue.closedAt || issue.updatedAt)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{issue.labels.filter((label) => labelName(label).toLowerCase() !== "noxspot").slice(0, 4).map((label) => <span key={labelName(label)} className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-600">{labelName(label)}</span>)}</div>
              </div>
            </div>
          </article>
        ))}
      </div>
      {issues.length < total ? <p className="mt-2 text-xs text-stone-500">Showing the {issues.length} most recently updated.</p> : null}
    </div>
  );
}

export function TimelineEntry({ merge }: { merge: Merge }) {
  return (
    <article className="relative pl-8">
      <span className="absolute left-0 top-2 grid size-6 place-items-center rounded-full border border-stone-300 bg-[#f6f3e8] text-[#34734c]"><GitMerge size={12} /></span>
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-[#34734c]">Merged {formatDate(merge.mergedAt)}</p><h3 className="mt-1 font-medium leading-5">{merge.title}</h3><p className="mt-1 text-xs text-stone-500">#{merge.number} · {merge.author?.login ?? "Unknown"}</p></div>{merge.url ? <a href={merge.url} target="_blank" rel="noreferrer" className="text-stone-400 hover:text-[#34734c]" aria-label={`Open pull request ${merge.number}`}><ExternalLink size={14} /></a> : null}</div>
        {merge.linkedIssues.length > 0 ? (
          <div className="mt-4 border-t border-stone-100 pt-3" aria-label={`Issues linked to pull request ${merge.number}`}>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500"><Link2 size={12} /> Linked issues</p>
            <div className="mt-2 space-y-1.5">
              {merge.linkedIssues.map((issue) => (
                <details
                  key={issue.number}
                  className="group rounded-xl bg-stone-50 text-xs text-stone-700 open:bg-stone-100"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 transition hover:text-[#34734c] [&::-webkit-details-marker]:hidden">
                    <span className={`size-2 shrink-0 rounded-full ${issue.state === "closed" ? "bg-[#34734c]" : "bg-[#d53a12]"}`} />
                    <span className="shrink-0 font-mono text-stone-500">#{issue.number}</span>
                    <span className="min-w-0 flex-1 truncate">{issue.title}</span>
                    <span className="shrink-0 text-[10px] capitalize text-stone-400">{issue.state}</span>
                    <ChevronDown aria-hidden="true" size={13} className="shrink-0 text-stone-400 transition group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-stone-200 px-3 pb-3 pt-3">
                    {issue.screenshotUrl ? (
                      <img
                        src={issue.screenshotUrl}
                        alt={`Captured screen for ${issue.title}`}
                        loading="lazy"
                        className="mb-3 max-h-72 w-full rounded-lg border border-stone-200 bg-white object-contain"
                      />
                    ) : null}
                    <h4 className="font-medium text-stone-800">{issue.title}</h4>
                    <p className="mt-2 whitespace-pre-wrap leading-5 text-stone-600">{issue.description || "No description was submitted."}</p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-2 text-[11px] text-stone-500">
                      <span>Submitted by <strong className="font-medium text-stone-700">{issue.submittedBy || "Anonymous"}</strong></span>
                      <a href={`#issue-${issue.number}`} aria-label={`View linked issue #${issue.number}: ${issue.title}`} className="font-medium text-[#34734c] hover:underline">View in issues</a>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        ) : null}
        {merge.post ? <div className="mt-4 rounded-xl bg-[#edf4ee] p-4"><p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#34734c]"><MessageSquareText size={12} /> Post</p><p className="text-sm leading-6 text-stone-700">{merge.post}</p></div> : null}
        {merge.releaseNotes ? <details className="mt-3 rounded-xl border border-stone-200 p-3"><summary className="cursor-pointer text-xs font-semibold text-stone-600">Release notes</summary><div className="prose prose-stone mt-3 max-w-none text-sm prose-headings:font-display"><ReactMarkdown>{merge.releaseNotes}</ReactMarkdown></div></details> : null}
      </div>
    </article>
  );
}
