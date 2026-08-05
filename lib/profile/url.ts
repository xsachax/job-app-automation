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

const GOOGLE_DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,}$/;

function googleDriveFileId(url: URL): string {
  const pathMatch = url.pathname.match(/^\/file\/d\/([^/]+)/);
  const candidate = pathMatch?.[1] || url.searchParams.get("id") || "";
  return GOOGLE_DRIVE_FILE_ID.test(candidate) ? candidate : "";
}

export function normalizeResumePdfUrl(input: string): string {
  let original: URL;
  try {
    original = new URL(input.trim());
  } catch {
    throw new Error("Enter a valid HTTPS resume PDF link.");
  }
  if (original.protocol !== "https:") {
    throw new Error("The resume PDF link must use HTTPS.");
  }

  const normalized = normalizeResumeUrl(input);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Enter a valid HTTPS resume PDF link.");
  }

  if (url.hostname === "drive.google.com") {
    const fileId = googleDriveFileId(url);
    if (!fileId) {
      throw new Error("Use a Google Drive file share link with a valid file ID.");
    }
    return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
  }

  if (
    ["github.com", "raw.githubusercontent.com", "gist.github.com"].includes(
      url.hostname,
    )
  ) {
    return url.toString();
  }

  throw new Error(
    "Resume PDFs must be hosted on public GitHub or Google Drive links.",
  );
}
