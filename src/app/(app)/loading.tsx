/** Lightweight route fallback shown while authenticated data is loading. */
export default function AppLoading() {
  return (
    <div className="mx-auto max-w-5xl" aria-label="Loading" role="status">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-zinc-200" />
      <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-zinc-100" />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-white shadow-subtle" />)}
      </div>
      <div className="mt-6 h-64 animate-pulse rounded-2xl bg-white shadow-subtle" />
    </div>
  );
}
