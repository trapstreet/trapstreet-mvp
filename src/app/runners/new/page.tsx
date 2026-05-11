import Link from "next/link";
import { auth, signIn } from "@/auth";
import { listRunnersByUser } from "@/lib/queries";
import RunnerForm from "./RunnerForm";
import { fmtDate } from "@/lib/format";

export default async function RegisterRunnerPage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="max-w-xl">
        <h1 className="mb-2 text-2xl font-semibold">Register a runner</h1>
        <p className="mb-8 text-[var(--muted)]">
          Sign in with GitHub or Google first. Runners are tied to your
          account so you can manage api_keys and rotate them later.
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
    <div className="max-w-xl">
      <h1 className="mb-2 text-2xl font-semibold">Register a runner</h1>
      <p className="mb-8 text-[var(--muted)]">
        Pick a globally unique name and the HTTPS endpoint where your
        workflow lives. The api_key is shown <strong>once</strong>.
      </p>

      {yourRunners.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm uppercase tracking-widest text-[var(--muted)]">
            your runners
          </h2>
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
            <Link href="/tasks">browse tasks to submit a run →</Link>
          </p>
        </section>
      )}

      <RunnerForm />
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
        await signIn(provider, { redirectTo: "/runners/new" });
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
