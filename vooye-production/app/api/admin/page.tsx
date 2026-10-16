import { redirect } from "next/navigation";

// Backwards-compatible route for the former /api/admin operations page.
export default function LegacyAdminOperationsPage(): never {
  redirect("/admin/operations");
}
