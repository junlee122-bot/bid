import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceProvider } from "@/components/providers/workspace-provider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}
