interface Env {
  GITHUB_APP_CLIENT_ID?: string;
}

interface Ctx {
  env: Env;
  request: Request;
}

function randomHex(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

/// Starts the system-browser OAuth flow for NoxKey. The normal GitHub callback
/// remains authoritative; this endpoint only records that a successful flow
/// should return its one-time exchange code to ASWebAuthenticationSession.
export async function onRequestGet(context: Ctx): Promise<Response> {
  const clientID = context.env.GITHUB_APP_CLIENT_ID;
  if (!clientID) {
    return Response.json({ error: "OAuth is not configured" }, { status: 503 });
  }

  const requestURL = new URL(context.request.url);
  const state = randomHex(32);
  const callback = `${requestURL.origin}/api/auth/callback`;
  const authorizationURL = new URL("https://github.com/login/oauth/authorize");
  authorizationURL.searchParams.set("client_id", clientID);
  authorizationURL.searchParams.set("redirect_uri", callback);
  authorizationURL.searchParams.set("state", state);

  const headers = new Headers({
    Location: authorizationURL.toString(),
    "Cache-Control": "no-store",
  });
  headers.append("Set-Cookie", `ut_oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure`);
  headers.append("Set-Cookie", "ut_oauth_client=noxkey; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure");
  return new Response(null, { status: 302, headers });
}
