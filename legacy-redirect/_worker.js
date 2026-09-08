const CANONICAL_ORIGIN = "https://app.noxhere.com";

const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function canonicalUrl(requestUrl) {
  const incoming = new URL(requestUrl);
  const destination = new URL(CANONICAL_ORIGIN);

  // Assign components instead of resolving a string so a path beginning with
  // `//` can never be interpreted as a different host.
  destination.pathname = incoming.pathname;
  destination.search = incoming.search;

  return destination;
}

export default {
  fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return Response.json(
        {
          error: "Legacy host retired",
          canonical_origin: CANONICAL_ORIGIN,
        },
        {
          status: 410,
          headers: {
            ...securityHeaders,
            "Cache-Control": "no-store",
          },
        },
      );
    }

    return new Response(null, {
      status: 308,
      headers: {
        ...securityHeaders,
        "Cache-Control": "public, max-age=3600",
        Location: canonicalUrl(request.url).href,
      },
    });
  },
};
