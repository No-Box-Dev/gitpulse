// NoxConnect's user-token GitHub facade. Native and web product clients send
// their OAuth token to NoxConnect; only this server-side module calls GitHub.

const API = "https://api.github.com";

export async function getGitHubUserProfile(token) {
  return githubUserRequest(token, "/user");
}

export async function getGitHubUserOrganizations(token) {
  return githubUserRequest(token, "/user/orgs?per_page=100");
}

async function githubUserRequest(token, path) {
  if (typeof token !== "string" || !token) throw githubUserError("Missing bearer token", 401);
  const response = await fetch(`${API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "noxconnect",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw githubUserError(data?.message || `GitHub request failed (${response.status})`, response.status);
  return data;
}

function githubUserError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
