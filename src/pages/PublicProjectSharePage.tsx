import { useCallback, useEffect, useState } from "react";
import { ChevronDown, CircleCheck, CircleDot, ExternalLink, GitPullRequest, LockKeyhole, LogOut, MessageSquareText, Radio, ShieldCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useParams } from "react-router-dom";
import { Spinner } from "@/components/Spinner";

interface Issue {
  number: number;
  title: string;
  state: string;
  author: { login: string; avatarUrl: string | null } | null;
  labels: Array<{ name?: string; color?: string } | string>;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  url: string;
  description: string | null;
  submittedBy: string | null;
  screenshotUrl: string | null;
  resolution: {
    merge: {
      number: number;
      title: string;
      mergedAt: string;
      url: string;
      author: { login: string; avatarUrl: string | null } | null;
    } | null;
    post: string | null;
    releaseNotes: string | null;
  } | null;
}

interface PortalData {
  project: { name: string; repo: string };
  counts: { open: number; closed: number };
  issues: Issue[];
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
            <p className="text-sm leading-6 text-stone-300">Enter the project password to view its read-only NoxSpot issue history.</p>
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
        <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-11">
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
          <div className="mt-8 grid max-w-sm grid-cols-2 gap-2">
            {[{ label: "Open", value: data.counts.open }, { label: "Solved", value: data.counts.closed }].map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-black/15 px-4 py-3"><p className="font-display text-2xl">{stat.value}</p><p className="mt-0.5 text-[11px] text-white/65">{stat.label}</p></div>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 lg:py-14">
        <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c92e08]">NoxSpot</p><h2 className="mt-1 font-display text-3xl">Issues</h2></div>
        <IssueGroup title="Open" issues={openIssues} total={data.counts.open} empty="No open issues." />
        <div className="mt-12"><SolvedIssueSection issues={closedIssues} total={data.counts.closed} /></div>
      </div>
      <footer className="border-t border-black/10 px-5 py-7 text-center text-xs text-stone-500">Protected read-only project view powered by NoxSpot + NoxFeed</footer>
    </main>
  );
}

function IssueGroup({ title, issues, total, empty }: { title: string; issues: Issue[]; total: number; empty: string }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        {title === "Open" ? <CircleDot size={17} className="text-[#d53a12]" /> : <CircleCheck size={17} className="text-[#34734c]" />}
        <h3 className="font-display text-xl">{title}</h3>
        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-600">{total}</span>
      </div>
      <div className="space-y-3">
        {issues.length === 0 ? <p className="rounded-2xl border border-dashed border-stone-300 p-5 text-sm text-stone-500">{empty}</p> : issues.map((issue) => <IssueCard key={issue.number} issue={issue} />)}
      </div>
      {issues.length < total ? <p className="mt-2 text-xs text-stone-500">Showing the {issues.length} most recently updated.</p> : null}
    </section>
  );
}

function groupSolvedIssues(issues: Issue[]): Issue[][] {
  const groups = new Map<string, Issue[]>();
  for (const issue of issues) {
    const mergeNumber = issue.resolution?.merge?.number;
    const key = mergeNumber ? `pr:${mergeNumber}` : `issue:${issue.number}`;
    const group = groups.get(key);
    if (group) group.push(issue);
    else groups.set(key, [issue]);
  }
  return [...groups.values()];
}

function SolvedIssueSection({ issues, total }: { issues: Issue[]; total: number }) {
  const groups = groupSolvedIssues(issues);
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <CircleCheck size={17} className="text-[#34734c]" />
        <h3 className="font-display text-xl">Solved</h3>
        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-600">{total}</span>
      </div>
      <div className="space-y-3">
        {groups.length === 0 ? <p className="rounded-2xl border border-dashed border-stone-300 p-5 text-sm text-stone-500">No solved issues yet.</p> : groups.map((group) => (
          <SolvedIssueGroup key={group[0].resolution?.merge?.number ? `pr:${group[0].resolution.merge.number}` : `issue:${group[0].number}`} issues={group} />
        ))}
      </div>
      {issues.length < total ? <p className="mt-2 text-xs text-stone-500">Showing the {issues.length} most recently updated.</p> : null}
    </section>
  );
}

export function SolvedIssueGroup({ issues }: { issues: Issue[] }) {
  const representative = issues[0];
  if (!representative) return null;
  return (
    <article className="scroll-mt-5 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div data-testid="resolution" className="p-5">
        <ResolutionTimeline issue={representative} />
      </div>
      <div className="border-t border-stone-100">
        <div className="flex items-center gap-2 px-5 pb-2 pt-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">{issues.length === 1 ? "Issue solved" : "Issues solved"}</p>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">{issues.length}</span>
        </div>
        <div className="divide-y divide-stone-100">
          {issues.map((issue) => <IssueDetails key={issue.number} issue={issue} nested />)}
        </div>
      </div>
    </article>
  );
}

export function IssueCard({ issue }: { issue: Issue }) {
  const solved = issue.state === "closed";
  if (solved) return <SolvedIssueGroup issues={[issue]} />;

  return <IssueDetails issue={issue} />;
}

function IssueDetails({ issue, nested = false }: { issue: Issue; nested?: boolean }) {
  return (
    <details
      id={`issue-${issue.number}`}
      data-testid="issue-details"
      className={`group scroll-mt-5 ${nested ? "" : "rounded-2xl border border-stone-200 bg-white shadow-sm open:shadow-md"}`}
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 p-5 [&::-webkit-details-marker]:hidden">
        <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${nested ? "bg-stone-400" : "bg-[#d53a12]"}`} />
        <div className="min-w-0 flex-1">
          <h4 className="font-medium leading-6 text-stone-900">{issue.title}</h4>
          <p className="mt-1 text-xs text-stone-500">#{issue.number} · Submitted by {issue.submittedBy || "Anonymous"} · {formatDate(issue.createdAt)}</p>
        </div>
        <ChevronDown aria-hidden="true" size={16} className="mt-1 shrink-0 text-stone-400 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-stone-100 px-5 pb-5 pt-5">
        {issue.screenshotUrl ? <CaptureScreenshot issue={issue} /> : null}
        <p className="whitespace-pre-wrap text-sm leading-6 text-stone-700">{issue.description || "No description was submitted."}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {issue.labels.filter((label) => labelName(label).toLowerCase() !== "noxspot").slice(0, 4).map((label) => <span key={labelName(label)} className="rounded-full bg-stone-100 px-2 py-1 text-[10px] text-stone-600">{labelName(label)}</span>)}
          {issue.url ? <a href={issue.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-[#c92e08]">GitHub issue <ExternalLink size={12} /></a> : null}
        </div>
      </div>
    </details>
  );
}

function CaptureScreenshot({ issue }: { issue: Issue }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div role="status" className="mb-5 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-10 text-center text-sm text-stone-500">Screenshot unavailable</div>;
  }
  return <img src={issue.screenshotUrl ?? ""} alt={`Captured screen for ${issue.title}`} loading="lazy" onError={() => setFailed(true)} className="mb-5 max-h-[28rem] w-full rounded-xl border border-stone-200 bg-stone-50 object-contain" />;
}

function ResolutionTimeline({ issue }: { issue: Issue }) {
  const resolution = issue.resolution;
  const hasNoxFeed = Boolean(resolution?.post || resolution?.releaseNotes);
  return (
    <div>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#34734c]">Resolution</p>
      {hasNoxFeed ? (
        <div className="rounded-xl bg-[#edf4ee] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-[#34734c]"><MessageSquareText size={14} /> NoxFeed update</p>
            {resolution?.merge ? <a href={resolution.merge.url} target="_blank" rel="noreferrer" className="text-[11px] text-stone-500 hover:text-[#34734c]">PR #{resolution.merge.number}</a> : null}
          </div>
          {resolution?.post ? <p className="mt-3 text-sm leading-6 text-stone-700">{resolution.post}</p> : null}
          {resolution?.releaseNotes ? <details className="mt-3 rounded-lg border border-[#34734c]/15 bg-white/60 p-3"><summary className="cursor-pointer text-xs font-semibold text-stone-600">Release notes</summary><div className="prose prose-stone mt-3 max-w-none text-sm prose-headings:font-display"><ReactMarkdown>{resolution.releaseNotes}</ReactMarkdown></div></details> : null}
        </div>
      ) : resolution?.merge ? (
        <a href={resolution.merge.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 rounded-xl bg-stone-50 p-4 transition hover:bg-stone-100">
          <GitPullRequest size={17} className="mt-0.5 shrink-0 text-[#34734c]" />
          <span className="min-w-0"><strong className="block text-sm font-medium text-stone-800">Solved in PR #{resolution.merge.number}</strong><span className="mt-0.5 block text-xs text-stone-500">{resolution.merge.title} · {formatDate(resolution.merge.mergedAt)}</span></span>
        </a>
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-stone-50 p-4 text-sm text-stone-600"><CircleCheck size={17} className="text-[#34734c]" /> Closed {formatDate(issue.closedAt || issue.updatedAt)}</div>
      )}
    </div>
  );
}
