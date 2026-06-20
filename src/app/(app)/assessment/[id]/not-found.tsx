import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="text-lg font-semibold text-zinc-900">Description not found</h1>
      <Link href="/assessment" className="mt-4 inline-block text-sm text-accent-700 hover:underline">
        Back to Assessment-Safe
      </Link>
    </div>
  );
}
