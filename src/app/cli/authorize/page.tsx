import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { ensureUserRow, getOrCreateCliSolution } from "@/lib/queries";

// /cli/authorize?return=http://localhost:<port>/callback
//
// The `tp auth login` CLI command starts a localhost server, opens this
// page in the user's browser, and waits for us to redirect back with
// an api_key in the query string. Loopback OAuth-style flow.
//
// Security: only http://127.0.0.1:<port>/<path> or http://localhost:<port>/<path>
// return URLs are accepted, to prevent exfiltrating api_key via open
// redirect.
export default async function CliAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>;
}) {
  const sp = await searchParams;
  const returnUrl = sp.return ?? "";

  if (!isLocalhostUrl(returnUrl)) {
    return (
      <ErrorPanel>
        Invalid <code>return</code> parameter. Must be an{" "}
        <code>http://localhost:&lt;port&gt;</code> or{" "}
        <code>http://127.0.0.1:&lt;port&gt;</code> URL. Aborting to protect
        your api_key.
      </ErrorPanel>
    );
  }

  const session = await auth();
  if (!session?.user) {
    const callbackUrl = `/cli/authorize?return=${encodeURIComponent(returnUrl)}`;
    return (
      <div className="max-w-xl">
        <h1 className="mb-2 text-2xl font-semibold">Pair CLI</h1>
        <p className="mb-6 text-[var(--muted)]">
          Sign in to grant your <code className="text-[var(--foreground)]">tp</code>{" "}
          CLI access to your account. You&apos;ll see this prompt only on
          first login.
        </p>
        <div className="space-y-3">
          <SignInButton provider="github" label="continue with github" callbackUrl={callbackUrl} />
          <SignInButton provider="google" label="continue with google" callbackUrl={callbackUrl} />
        </div>
      </div>
    );
  }

  const userName = session.user.name ?? session.user.email ?? "user";

  async function approve() {
    "use server";
    const s = await auth();
    if (!s?.user?.id) {
      throw new Error("not signed in");
    }
    if (!isLocalhostUrl(returnUrl)) {
      throw new Error("invalid return url");
    }
    // Recreate the users row if a stale JWT outlived a DB reset
    // (otherwise the solutions.user_id FK insert below fails).
    await ensureUserRow(s.user.id, {
      name: s.user.name,
      email: s.user.email,
      image: s.user.image,
    });
    const solution = await getOrCreateCliSolution(
      s.user.id,
      s.user.name ?? s.user.email ?? "user",
    );
    const sep = returnUrl.includes("?") ? "&" : "?";
    redirect(
      `${returnUrl}${sep}api_key=${encodeURIComponent(solution.api_key)}` +
        `&solution=${encodeURIComponent(solution.name)}`,
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-2 text-2xl font-semibold">Pair CLI</h1>
      <p className="mb-6 text-[var(--muted)]">
        Your <code className="text-[var(--foreground)]">tp</code> CLI wants
        to act on your behalf. Click approve to send your default solution&apos;s{" "}
        <code className="text-[var(--foreground)]">api_key</code> back to{" "}
        <code className="text-[var(--foreground)]">{returnUrl}</code>.
      </p>
      <div className="mb-6 rounded border border-[var(--border)] p-4 text-sm">
        <p className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">
          signed in as
        </p>
        <p className="text-[var(--foreground)]">{userName}</p>
      </div>
      <form action={approve}>
        <button
          type="submit"
          className="rounded border border-[var(--accent)] px-4 py-2 text-sm text-[var(--accent)] hover:bg-[var(--accent)]/10"
        >
          approve &amp; continue to CLI
        </button>
      </form>
      <p className="mt-4 text-xs text-[var(--muted)]">
        Cancel by closing this tab — the CLI will time out after 5 minutes.
      </p>
    </div>
  );
}

function isLocalhostUrl(s: string): boolean {
  try {
    const u = new URL(s);
    if (u.protocol !== "http:") return false;
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function SignInButton({
  provider,
  label,
  callbackUrl,
}: {
  provider: "github" | "google";
  label: string;
  callbackUrl: string;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn(provider, { redirectTo: callbackUrl });
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

function ErrorPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-xl rounded border border-red-500 p-5">
      <p className="mb-2 text-[10px] uppercase tracking-widest text-red-400">
        error
      </p>
      <p className="text-sm">{children}</p>
    </div>
  );
}
