// Normalize a user-supplied resume link into something the server can fetch as
// raw text/bytes. The common case is a GitHub link: users paste the pretty
// "blob" URL from the address bar, which returns an HTML page, not the file.
// We rewrite those (and gist links) to their raw equivalents so "Refresh
// profile" reads the actual résumé instead of GitHub's chrome.

/**
 * Convert GitHub UI URLs to their raw-content form. Non-GitHub URLs and URLs we
 * don't recognize are returned unchanged (trimmed).
 *
 * Handled:
 *  - github.com/{owner}/{repo}/blob/{ref}/{path}  → raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}
 *  - github.com/{owner}/{repo}/raw/{ref}/{path}   → raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}
 *  - gist.github.com/{user}/{id}                  → gist.github.com/{user}/{id}/raw
 */
export function normalizeResumeUrl(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  const host = url.hostname.toLowerCase();

  // github.com/{owner}/{repo}/(blob|raw)/{ref}/{path...}
  if (host === "github.com" || host === "www.github.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    const kind = parts[2];
    if (parts.length >= 5 && (kind === "blob" || kind === "raw")) {
      const [owner, repo, , ref, ...rest] = parts;
      const path = rest.join("/");
      return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
    }
    return raw;
  }

  // gist.github.com/{user}/{id} → append /raw for the latest revision of the
  // single (or first) file. Leave already-raw gist links alone.
  if (host === "gist.github.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[parts.length - 1] !== "raw") {
      return `https://gist.github.com${url.pathname.replace(/\/$/, "")}/raw`;
    }
    return raw;
  }

  return raw;
}

/** True when the URL points at a GitHub-hosted resource we can rewrite/fetch. */
export function isGithubResumeUrl(input: string): boolean {
  try {
    const host = new URL(input.trim()).hostname.toLowerCase();
    return host === "github.com" || host === "www.github.com" || host === "gist.github.com" || host === "raw.githubusercontent.com";
  } catch {
    return false;
  }
}
