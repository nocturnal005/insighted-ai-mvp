import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="text-lg font-semibold text-zinc-900">Task not found</h1>
      <p className="mt-1 text-sm text-zinc-500">This Braille review doesn&apos;t exist.</p>
      <Link href="/braille" className="mt-4 inline-block text-sm text-accent-700 hover:underline">
        Back to reviews
      </Link>
    </div>
  );
}
