(function registerSessionScope(root) {
  const greenhouseOrigins = [
    "https://boards.greenhouse.io",
    "https://job-boards.greenhouse.io"
  ];

  function originOf(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.origin : "";
    } catch {
      return "";
    }
  }

  function approvedOriginsFor(value) {
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) {
        return [];
      }
      if (greenhouseOrigins.includes(url.origin)) {
        return [...greenhouseOrigins];
      }
      return [url.origin];
    } catch {
      return [];
    }
  }

  function applicationOrigins(session) {
    const storedOrigins = Array.isArray(session?.applicationOrigins)
      ? session.applicationOrigins.map(originOf).filter(Boolean)
      : [];
    if (storedOrigins.length) {
      return Array.from(new Set(storedOrigins));
    }

    const singleOrigin = originOf(session?.applicationOrigin);
    return singleOrigin ? [singleOrigin] : [];
  }

  function applicationOrigin(session) {
    return applicationOrigins(session)[0] || "";
  }

  function isAllowedUrl(session, nextUrl) {
    const nextOrigin = originOf(nextUrl);
    return Boolean(nextOrigin) && applicationOrigins(session).includes(nextOrigin);
  }

  const api = Object.freeze({
    originOf,
    approvedOriginsFor,
    applicationOrigins,
    applicationOrigin,
    isAllowedUrl
  });

  root.JobAutofillSessionScope = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis === "object" ? globalThis : this);
