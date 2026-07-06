import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AdminLogin } from "@/components/admin/admin-login";
import { getAdminDashboardData } from "@/lib/admin/dashboard";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const metadata = {
  title: "Administration - Nathan & Innocente",
  description: "Gestion des invitations et confirmations",
};

export default async function AdminPage() {
  const loggedIn = await isAdminAuthenticated();

  if (!loggedIn) {
    return <AdminLogin />;
  }

  const { guests, stats } = await getAdminDashboardData();

  return <AdminDashboard initialGuests={guests} initialStats={stats} />;
}
