import "./dashboard.css";
import { Sidebar } from "./_components/sidebar";
import { Topbar } from "./_components/topbar";
import { DashboardProvider } from "./_components/dashboard-provider";
import { AccessGuard } from "./_components/access-guard";

/**
 * DashboardLayout, layout voor alle /dashboard/* pagina's.
 *
 * Structuur:
 *   - DashboardProvider:  laadt restaurants + rol + permissies (context)
 *   - AccessGuard:        blokkeert paginas waarop je geen rechten hebt
 *   - Sidebar/Topbar:     standaard navigatie-chrome
 *   - main > children:    de eigenlijke pagina-inhoud
 */
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <DashboardProvider>
      <div className="dashboard-shell">
        <Sidebar />
        <Topbar />
        <main className="main">
          <AccessGuard>{children}</AccessGuard>
        </main>
      </div>
    </DashboardProvider>
  );
}
