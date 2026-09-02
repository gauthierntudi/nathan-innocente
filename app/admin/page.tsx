import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AdminLogin } from "@/components/admin/admin-login";
import { getAdminDashboardData } from "@/lib/admin/dashboard";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  parseAdminSection,
  parseCeremonyId,
} from "@/lib/admin/navigation-shared";

export const metadata = {
  title: "Administration - Nathan & Innocente",
  description: "Gestion des invitations et confirmations",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; ceremony?: string }>;
}) {
  const loggedIn = await isAdminAuthenticated();

  if (!loggedIn) {
    return <AdminLogin />;
  }

  const params = await searchParams;
  const initialSection = parseAdminSection(params.section ?? null);
  const initialCeremonyId = parseCeremonyId(params.ceremony ?? null);
  const { guests, stats } = await getAdminDashboardData();

  return (
    <AdminDashboard
      initialGuests={guests}
      initialStats={stats}
      initialSection={initialSection}
      initialCeremonyId={initialCeremonyId}
    />
  );
}
