import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="mb-2 text-sm uppercase tracking-widest text-[var(--muted)]">
        404
      </p>
      <h1 className="mb-4 text-2xl font-semibold">Trail ends here.</h1>
      <p className="text-[var(--muted)]">
        The thing you were looking for has drifted off the map.{" "}
        <Link href="/">back to leaderboard →</Link>
      </p>
    </div>
  );
}
