import Link from "next/link";

export default function NotFound() {
  return (
    <main className="field grid min-h-svh content-center gap-4 px-8">
      <p className="label">Exhibit missing</p>
      <h1 className="display text-7xl">This page was never filed.</h1>
      <Link href="/" className="btn w-fit">
        Back to AutoEvolve
      </Link>
    </main>
  );
}
