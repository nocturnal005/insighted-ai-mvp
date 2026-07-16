import Link from "next/link";
import { redirect } from "next/navigation";
import { Trash2, FileText, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can, ROLE_LABELS, ROLE_INITIALS, ROLE_STAFF_LABEL, ALL_ROLES } from "@/lib/rbac";
import { getUsers, getSettings } from "@/lib/data";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { secureDeleteExpiredMaterial, setUserRole, setRetention, setBrailleLiterate } from "./actions";

export default function AdminPage() {
  const user = requireUser();
  if (!can(user.role, "org.manage")) redirect("/dashboard");

  const users = getUsers();
  const settings = getSettings();

  return (
    <>
      <PageHeader title="Admin & Security" description="Users, roles, data retention and compliance." />

      {/* Users & roles */}
      <Card className="mb-5">
        <CardHeader><CardTitle>Users & roles</CardTitle><span className="text-xs text-zinc-400">{users.length} members</span></CardHeader>
        <CardBody className="p-0">
          <ul className="divide-y divide-zinc-100">
            {users.map((u) => (
              <li key={u.id} className="flex flex-col items-stretch gap-3.5 px-5 py-3.5 md:flex-row md:items-center">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-[11px] font-semibold text-accent-700">{ROLE_INITIALS[u.role]}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                    {ROLE_STAFF_LABEL[u.role]}
                    {u.brailleLiterate && (
                      <span
                        title="Explicitly Braille-literate — may specialist-verify Braille accuracy even as a Teaching Assistant"
                        className="inline-flex items-center rounded-md bg-accent-50 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700"
                      >
                        Braille-literate
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-400">{u.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={setBrailleLiterate}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="brailleLiterate" value={u.brailleLiterate ? "false" : "true"} />
                    <button
                      title="Braille-literate status allows a staff member, including a Teaching Assistant, to specialist-verify Braille accuracy."
                      className={`h-9 rounded-lg border px-3 text-[13px] font-medium ${
                        u.brailleLiterate
                          ? "border-accent-200 bg-accent-50 text-accent-700 hover:bg-accent-100"
                          : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                      }`}
                    >
                      {u.brailleLiterate ? "Braille-literate ✓" : "Mark Braille-literate"}
                    </button>
                  </form>
                  <form action={setUserRole} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <select name="role" defaultValue={u.role} className="h-9 rounded-lg border border-zinc-200 px-2 text-[13px]">
                      {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                    <button className="h-9 rounded-lg border border-zinc-200 px-3 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50">Save</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
          <p className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500">
            Braille-literate status allows a staff member, including a Teaching Assistant, to specialist-verify Braille
            accuracy. Ordinary teachers cannot verify Braille by default; QTVIs and Admins always can.
          </p>
        </CardBody>
      </Card>

      {/* Data & security */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Data retention</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <form action={setRetention} className="flex items-end gap-3">
              <div>
                <label htmlFor="retentionDays" className="mb-1.5 block text-sm font-medium text-zinc-700">Retain pupil material for</label>
                <div className="flex items-center gap-2">
                  <input id="retentionDays" name="retentionDays" type="number" min={1} defaultValue={settings.retentionDays} className="h-9 w-28 rounded-lg border border-zinc-200 px-3 text-sm" />
                  <span className="text-sm text-zinc-500">days</span>
                </div>
              </div>
              <button className="h-9 rounded-lg bg-zinc-900 px-3.5 text-[13px] font-medium text-white hover:bg-zinc-800">Update</button>
            </form>
            <div className="flex items-start gap-2.5 rounded-xl bg-zinc-50 px-3.5 py-3 text-sm text-zinc-600">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-positive-600" />
              <span>Pupil uploads are <span className="font-medium">never used to train AI</span> by default.</span>
            </div>
            <form action={secureDeleteExpiredMaterial}>
              <button className="inline-flex items-center gap-2 rounded-lg border border-critical-200 px-3.5 py-2 text-[13px] font-medium text-critical-600 hover:bg-critical-50">
                <Trash2 className="h-4 w-4" /> Secure-delete expired uploads
              </button>
            </form>
            <p className="text-xs text-zinc-400">Deletes locally stored upload files older than the retention period and writes a deletion audit record.</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Compliance</CardTitle></CardHeader>
          <CardBody className="space-y-2">
            <Link href="/privacy" className="flex items-center gap-3 rounded-lg border border-zinc-100 px-3.5 py-3 text-sm hover:bg-zinc-50">
              <FileText className="h-4 w-4 text-zinc-400" /> <span className="flex-1 text-zinc-700">Privacy notice</span>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-400">draft</span>
            </Link>
            <Link href="/dpia" className="flex items-center gap-3 rounded-lg border border-zinc-100 px-3.5 py-3 text-sm hover:bg-zinc-50">
              <FileText className="h-4 w-4 text-zinc-400" /> <span className="flex-1 text-zinc-700">Data Protection Impact Assessment</span>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-400">draft</span>
            </Link>
            <Link href="/audit" className="flex items-center gap-3 rounded-lg border border-zinc-100 px-3.5 py-3 text-sm hover:bg-zinc-50">
              <FileText className="h-4 w-4 text-zinc-400" /> <span className="flex-1 text-zinc-700">Audit trail</span>
            </Link>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
