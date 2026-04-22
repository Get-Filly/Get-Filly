import "./dashboard.css";
import { Sidebar } from "./_components/sidebar";
import { Topbar } from "./_components/topbar";
import { DashboardProvider } from "./_components/dashboard-provider";

/**
 * DashboardLayout — layout voor alle /dashboard/* pagina's.
 *
 * Wrapt alles in een DashboardProvider (client component) die de
 * RestaurantContext opstart. Daardoor kan elk component hieronder
 * het actieve restaurant + rol + permissies lezen via
 * useRestaurant().
 */
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <DashboardProvider>
      <div className="dashboard-shell">
        <Sidebar />
        <Topbar />
        <main className="main">{children}</main>
      </div>
    </DashboardProvider>
  );
}
