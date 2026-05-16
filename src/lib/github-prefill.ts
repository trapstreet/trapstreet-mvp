// Parse a GitHub task URL and fetch metadata to prefill /tasks/new.
//
// Unauth GitHub API (60 req/hr/IP) is fine for low-volume "click the
// prefill button" flow. If we hit rate limits we'd add a server-side
// token; for now KISS.

export interface ParsedTaskUrl {
  owner: string;
  repo: string;
  ref: string;        // branch/tag/sha, defaults to "main"
  path: string;       // path within the repo, no leading/trailing slash
}

export interface PrefillResult {
  id: string;
  name: string;
  track: string;
  description: string;
  traptask_ref: string;
  rules_md: string;
}

/**
 * Accepts any of:
 *   https://github.com/<owner>/<repo>
 *   https://github.com/<owner>/<repo>/tree/<ref>/<path>
 *   https://github.com/<owner>/<repo>/blob/<ref>/<path>/<file>
 *   <owner>/<repo>/<path>          (our internal `traptask_ref` shape)
 */
export function parseGithubUrl(input: string): ParsedTaskUrl | null {
  const raw = input.trim();
  if (!raw) return null;

  // shape 1: full https URL
  const m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(?:tree|blob)\/([^/]+)\/(.*?))?\/?$/.exec(
    raw,
  );
  if (m) {
    const [, owner, repo, ref, path] = m;
    return {
      owner,
      repo: repo.replace(/\.git$/, ""),
      ref: ref || "main",
      // strip a trailing filename if /blob/ was used — task dir is the parent
      path: (path || "").replace(/\/$/, ""),
    };
  }

  // shape 2: owner/repo[/path] (our internal form)
  const parts = raw.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const [owner, repo, ...rest] = parts;
    return { owner, repo, ref: "main", path: rest.join("/") };
  }
  return null;
}

async function ghFetch(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" },
    // 1 min cache so a 2nd prefill on same URL doesn't burn quota
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${url}`);
  }
  return res.json();
}

async function ghFetchRaw(parsed: ParsedTaskUrl, pathInTask: string): Promise<string | null> {
  // Use the API's raw content endpoint so we get a proper 404 instead
  // of an HTML page when the file's missing.
  const url = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.ref}/${
    parsed.path ? parsed.path + "/" : ""
  }${pathInTask}`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) return null;
  return await res.text();
}

/**
 * Given a GitHub task-dir URL, pull whatever we can to pre-populate
 * the create-task form. Network failures degrade gracefully — we
 * always return a partial result, the user fills the rest.
 */
export async function prefillFromGithub(input: string): Promise<{
  result: Partial<PrefillResult>;
  warning?: string;
}> {
  const parsed = parseGithubUrl(input);
  if (!parsed) {
    return {
      result: {},
      warning: "Could not parse that as a GitHub URL.",
    };
  }

  const traptask_ref = parsed.path
    ? `${parsed.owner}/${parsed.repo}/${parsed.path}`
    : `${parsed.owner}/${parsed.repo}`;

  // ID: last segment of the path, normalised to kebab-case (matches our
  // `/tasks/:id` URL constraint).
  const lastSeg = parsed.path.split("/").filter(Boolean).pop() ?? parsed.repo;
  const id = slugify(lastSeg);

  // Track: second-to-last segment, e.g. .../tasks/pdf_reader/<name> → "pdf-reader"
  const segs = parsed.path.split("/").filter(Boolean);
  const trackSeg = segs.length >= 2 ? segs[segs.length - 2] : segs[0] ?? "";
  const track = slugify(trackSeg) || "community";

  const out: Partial<PrefillResult> = {
    id,
    track,
    traptask_ref,
  };

  // README: h1 → name, first paragraph → description, rest of doc → rules_md.
  // No more heuristic splitting — we tried classifying h2 sections into
  // rules vs IO buckets but the README is a coherent doc and slicing it
  // always landed something in the wrong place. The author writes one
  // markdown blob; we preserve it.
  try {
    const readme = await ghFetchRaw(parsed, "README.md");
    if (readme) {
      const { h1, intro, sections } = splitReadmeIntoSections(readme);
      if (h1) out.name = h1;
      if (intro) out.description = intro.slice(0, 280);
      if (sections.length > 0) {
        out.rules_md = sections
          .map((s) => `## ${s.title}\n\n${s.body}`)
          .join("\n\n");
      }
    }
  } catch {
    // ignore — we just won't have a name/description/rules
  }

  // Fallbacks
  if (!out.name) {
    out.name = humanize(id);
  }

  return { result: out };
}

// Split a README into (h1, intro-paragraph, h2-sections). Anything before
// the first h1 is discarded. The intro is whatever sits between the h1 and
// the first h2 — collapsed to its first paragraph for the description.
function splitReadmeIntoSections(md: string): {
  h1?: string;
  intro?: string;
  sections: { title: string; body: string }[];
} {
  const lines = md.split("\n");
  let h1: string | undefined;
  const introLines: string[] = [];
  const sections: { title: string; body: string[] }[] = [];
  let phase: "pre-h1" | "intro" | "section" = "pre-h1";
  let current: { title: string; body: string[] } | null = null;

  for (const line of lines) {
    if (!h1 && /^#\s+/.test(line)) {
      h1 = line.replace(/^#\s+/, "").trim();
      phase = "intro";
      continue;
    }
    if (phase !== "pre-h1" && /^##\s+/.test(line)) {
      current = { title: line.replace(/^##\s+/, "").trim(), body: [] };
      sections.push(current);
      phase = "section";
      continue;
    }
    if (phase === "intro") {
      introLines.push(line);
    } else if (phase === "section" && current) {
      current.body.push(line);
    }
  }

  // Collapse intro down to its first paragraph for the description field.
  const introText = introLines.join("\n").trim();
  const firstPara = introText.split(/\n\s*\n/)[0]?.trim().replace(/\n+/g, " ");

  return {
    h1,
    intro: firstPara || undefined,
    sections: sections
      .map((s) => ({ title: s.title, body: s.body.join("\n").trim() }))
      .filter((s) => s.body.length > 0),
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function humanize(s: string): string {
  return s
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
