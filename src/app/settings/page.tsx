import Link from "next/link";
import { auth, signIn } from "@/auth";
import { listRunnersByUser } from "@/lib/queries";
import RunnerForm from "./RunnerForm";
import { fmtDate } from "@/lib/format";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="max-w-xl">
        <h1 className="mb-2 text-2xl font-semibold">Settings</h1>
        <p className="mb-8 text-[var(--muted)]">
          Sign in to manage your runners, api_keys, and submitted tasks.
        </p>
        <div className="space-y-3">
          <SignInButton provider="github" label="continue with github" />
          <SignInButton provider="google" label="continue with google" />
        </div>
      </div>
    );
  }

  const yourRunners = await listRunnersByUser(session.user.id);

  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-2xl font-semibold">Settings</h1>
      <p className="mb-8 text-[var(--muted)]">
        Signed in as <strong>{session.user.name ?? session.user.email}</strong>.
      </p>

      <section className="mb-10">
        <p className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">
          runners · api keys
        </p>
        <p className="mb-4 text-sm text-[var(--muted)]">
          A runner is your submission identity on the leaderboard (e.g.{" "}
          <code className="text-[var(--foreground)]">claude-skill-v1</code>).
          Each runner has its own <code className="text-[var(--foreground)]">api_key</code>{" "}
          the <code className="text-[var(--foreground)]">tp</code> CLI uses
          when uploading. You can register multiple — one per tool / variant
          you want to benchmark.
        </p>

        <div className="mb-6 rounded border border-[var(--border)] p-4 text-sm">
          <p className="mb-1 text-[10px] uppercase tracking-widest text-[var(--accent)]">
            recommended · auto login
          </p>
          <p className="mb-3 text-[var(--muted)]">
            Easiest path — run <code className="text-[var(--foreground)]">tp login</code>{" "}
            and the CLI will pop a browser, you click approve, the api_key
            saves to <code className="text-[var(--foreground)]">~/.config/trapstreet/auth.json</code>{" "}
            automatically. No env var needed afterward.
          </p>
          <pre className="overflow-x-auto rounded bg-black/40 p-2 text-xs">
            <code>tp login</code>
          </pre>
        </div>

        <p className="mb-4 text-xs text-[var(--muted)]">
          Or paste the <code className="text-[var(--foreground)]">api_key</code>{" "}
          manually into your shell:
          <br />
          <code className="text-[var(--foreground)]">export TRAPSTREET_API_KEY=ts_...</code>
        </p>

        {yourRunners.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-xs uppercase tracking-widest text-[var(--muted)]">
              your runners
            </p>
            <table>
              <thead>
                <tr>
                  <th>name</th>
                  <th>endpoint</th>
                  <th>created</th>
                </tr>
              </thead>
              <tbody>
                {yourRunners.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className="text-[var(--muted)] truncate max-w-[200px]">
                      {r.endpoint_url}
                    </td>
                    <td className="text-[var(--muted)]">
                      {fmtDate(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-[var(--muted)]">
              <Link href="/">browse tasks to submit a run →</Link>
            </p>
          </div>
        )}

        <RunnerForm />
      </section>
    </div>
  );
}

function SignInButton({
  provider,
  label,
}: {
  provider: "github" | "google";
  label: string;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn(provider, { redirectTo: "/settings" });
      }}
    >
      <button
        type="submit"
        className="w-full rounded border border-[var(--accent)] px-4 py-2 text-sm text-[var(--accent)] hover:bg-[var(--accent)]/10"
      >
        {label}
      </button>
    </form>
  );
}
