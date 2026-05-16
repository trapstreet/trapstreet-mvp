// View-time helpers to render concrete case data from a task's GitHub
// source. `traptask_ref` is our compact `owner/repo/path` shape — we
// assume default branch = "main" everywhere (same convention as the
// task-source link on the leaderboard).
//
// Rate-limit posture: the tree fetch hits api.github.com (60 req/hr per
// IP unauth), raw fetches go through raw.githubusercontent.com which
// doesn't share the quota. Tree + per-file content are cached for 5 min.

interface RefParts {
  owner: string;
  repo: string;
  taskPath: string;
}

function splitRef(ref: string): RefParts {
  const parts = ref.split("/").filter(Boolean);
  const [owner, repo, ...rest] = parts;
  return { owner, repo, taskPath: rest.join("/") };
}

export interface TreeEntry {
  type: "blob" | "tree";
  // Path relative to the task root (not the repo root).
  path: string;
  size?: number;
}

// One recursive tree fetch per task render. Returns paths relative to
// the task root so callers don't have to strip the prefix themselves.
export async function fetchTaskTree(ref: string): Promise<TreeEntry[]> {
  const { owner, repo, taskPath } = splitRef(ref);
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`,
    {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 300 },
    },
  );
  if (!res.ok) throw new Error(`tree fetch ${res.status}`);
  const json = (await res.json()) as {
    tree?: { type: string; path: string; size?: number }[];
    truncated?: boolean;
  };
  if (!json.tree) return [];
  const prefix = taskPath ? taskPath + "/" : "";
  return json.tree
    .filter((e) => e.path.startsWith(prefix) && e.path !== taskPath)
    .map((e) => ({
      type: e.type === "tree" ? "tree" : "blob",
      path: e.path.slice(prefix.length),
      size: e.size,
    }));
}

export async function fetchRaw(
  ref: string,
  relPath: string,
): Promise<string | null> {
  const { owner, repo, taskPath } = splitRef(ref);
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/${
    taskPath ? taskPath + "/" : ""
  }${relPath}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return null;
  return res.text();
}

export interface TaskCase {
  id: string;
  description?: string;
}

// Tiny purpose-built parser. We only need the case ids (and their
// inline single-line descriptions when present) — pulling a real YAML
// dependency for this is overkill. If a task uses some exotic YAML
// shape, we return what we managed to parse and the page falls back
// to "see GitHub" gracefully.
export function parseTraptaskCases(yaml: string): TaskCase[] {
  const lines = yaml.split("\n");
  const cases: TaskCase[] = [];
  let inCases = false;
  let current: TaskCase | null = null;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "");

    if (/^cases:\s*$/.test(line)) {
      inCases = true;
      continue;
    }
    if (!inCases) continue;

    // A new top-level key (column-1, alpha) ends the cases block.
    if (/^[A-Za-z_]/.test(line)) {
      inCases = false;
      if (current) {
        cases.push(current);
        current = null;
      }
      continue;
    }

    const idMatch = /^\s*-\s+id:\s*['"]?([\w-]+)['"]?\s*$/.exec(line);
    if (idMatch) {
      if (current) cases.push(current);
      current = { id: idMatch[1] };
      continue;
    }

    if (!current) continue;

    const descMatch = /^\s+description:\s*['"]?(.+?)['"]?\s*$/.exec(line);
    if (descMatch) {
      current.description = descMatch[1].trim();
    }
  }
  if (current) cases.push(current);
  return cases;
}
