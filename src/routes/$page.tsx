import type { ComponentType } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppProvider } from "@/fos/context/AppContext";
import AppLayout from "@/fos/components/layout/AppLayout";
import DashboardPage from "@/fos/pages/DashboardPage";
import SalesPage from "@/fos/pages/SalesPage";
import RecordListPage from "@/fos/pages/RecordListPage";
import TenantsPage from "@/fos/pages/TenantsPage";
import CustomersPage from "@/fos/pages/CustomersPage";
import ApprovalsPage from "@/fos/pages/ApprovalsPage";
import WizardPage from "@/fos/pages/WizardPage";
import PreviewPage from "@/fos/pages/PreviewPage";
import FinancePage from "@/fos/pages/FinancePage";
import DocumentsPage from "@/fos/pages/DocumentsPage";
import ShiftPage from "@/fos/pages/ShiftPage";
import AiPage from "@/fos/pages/AiPage";
import FlagsPage from "@/fos/pages/FlagsPage";
import SupportPage from "@/fos/pages/SupportPage";
import SettingsPage from "@/fos/pages/SettingsPage";
import NotificationsPage from "@/fos/pages/NotificationsPage";
import PermissionsPage from "@/fos/pages/PermissionsPage";
import AuditPage from "@/fos/pages/AuditPage";

/** Screens that share the generic "list of records" layout. */
const RECORD_PAGES = ["engineering", "inventory", "manufacturing", "quality", "users", "billing", "health", "security", "announcements"];

const PAGES: Record<string, ComponentType> = {
  dashboard: DashboardPage, sales: SalesPage, tenants: TenantsPage, customers: CustomersPage, approvals: ApprovalsPage,
  wizard: WizardPage, preview: PreviewPage, finance: FinancePage, documents: DocumentsPage, shift: ShiftPage, ai: AiPage,
  flags: FlagsPage, support: SupportPage, settings: SettingsPage, account: SettingsPage, notifications: NotificationsPage,
  permissions: PermissionsPage, audit: AuditPage,
  ...Object.fromEntries(RECORD_PAGES.map((p) => [p, RecordListPage])),
};

export const Route = createFileRoute("/$page")({
  // The session lives in the browser, so the workspace renders on the client only.
  ssr: false,
  beforeLoad: ({ params }) => {
    if (!PAGES[params.page]) throw redirect({ to: "/$page", params: { page: "dashboard" } });
  },
  head: () => ({
    meta: [
      { title: "صنعة SANAA — مساحة العمل" },
      { name: "description", content: "مساحة عمل صنعة SANAA لإدارة مصنع الأثاث: الطلبات، التصنيع، المخزون، المالية، والمساعد الذكي." },
      { property: "og:title", content: "صنعة SANAA — مساحة العمل" },
      { property: "og:description", content: "مساحة عمل صنعة SANAA لإدارة مصنع الأثاث." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workspace,
});

function Workspace() {
  const { page } = Route.useParams();
  const Page = PAGES[page] ?? DashboardPage;
  return (
    <AppProvider page={page}>
      <AppLayout>
        <Page />
      </AppLayout>
    </AppProvider>
  );
}
