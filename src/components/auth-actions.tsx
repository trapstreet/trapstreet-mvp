import { auth, signIn, signOut } from "@/auth";

export async function HeaderAuth() {
  const session = await auth();
  if (!session?.user) {
    return (
      <form
        action={async () => {
          "use server";
          await signIn();
        }}
      >
        <button
          type="submit"
          className="text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          sign in
        </button>
      </form>
    );
  }
  const label = session.user.name ?? session.user.email ?? "signed in";
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
      className="flex items-center gap-3"
    >
      <span className="text-[var(--foreground)]">{label}</span>
      <button
        type="submit"
        className="text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        sign out
      </button>
    </form>
  );
}
