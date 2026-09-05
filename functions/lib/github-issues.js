// NoxConnect's GitHub issue transport. Product code supplies validated issue
// presentation; only this connector layer knows GitHub authentication and API
// mechanics. Product Workers must never receive the installation token.

const API = "https://api.github.com";

export async function findIssueByBodyMarker(token, owner, repo, marker) {
  const issues = await githubRequest(
    token,
    `/repos/${part(owner)}/${part(repo)}/issues?state=all&per_page=100`,
  );
  return issues.find((issue) => !issue.pull_request && String(issue.body || "").includes(marker)) ?? null;
}

export async function ensureRepositoryLabels(token, owner, repo, labels) {
  await Promise.all(labels.map(async (label) => {
    try {
      await githubRequest(token, `/repos/${part(owner)}/${part(repo)}/labels`, {
        method: "POST",
        body: JSON.stringify(label),
      });
    } catch (error) {
      // GitHub returns 422 when a label already exists. All other failures are
      // transport failures and must remain retryable.
      if (error.status !== 422) throw error;
    }
  }));
}

export async function createRepositoryIssue(token, owner, repo, issue) {
  return githubRequest(token, `/repos/${part(owner)}/${part(repo)}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title: issue.title,
      body: issue.body,
      labels: issue.labels,
    }),
  });
}

export async function getRepositoryIssue(token, owner, repo, issueNumber) {
  return githubRequest(token, `/repos/${part(owner)}/${part(repo)}/issues/${part(issueNumber)}`);
}

export async function updateRepositoryIssue(token, owner, repo, issueNumber, issue) {
  return githubRequest(token, `/repos/${part(owner)}/${part(repo)}/issues/${part(issueNumber)}`, {
    method: "PATCH",
    body: JSON.stringify(issue),
  });
}

export async function createRepositoryIssueComment(token, owner, repo, issueNumber, body) {
  return githubRequest(token, `/repos/${part(owner)}/${part(repo)}/issues/${part(issueNumber)}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

async function githubRequest(token, path, init = {}) {
  if (typeof token !== "string" || !token) throw new Error("GitHub installation token is required");
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "noxconnect",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || `GitHub request failed (${response.status})`);
    error.status = response.status;
    error.ghBody = data;
    throw error;
  }
  return data;
}

function part(value) {
  return encodeURIComponent(String(value));
}
