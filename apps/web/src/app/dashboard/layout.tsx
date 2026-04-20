import "./dashboard.css";
import { Sidebar } from "./_components/sidebar";
import { Topbar } from "./_components/topbar";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="dashboard-shell">
      <Sidebar />
      <Topbar />
      <main className="main">{children}</main>
    </div>
  );
}
