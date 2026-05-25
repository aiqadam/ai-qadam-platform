// L3 workspace-block barrel — operator-cabinet wrappers consumed by
// every page under `apps/web-next/src/pages/workspace/`. ADR-0038
// keeps customer + workspace surfaces visually distinct via this
// folder split; `common` blocks live next to both for cross-cutting
// concerns like <PageHead> and <AppFooter>.

export { ApprovalsList } from './ApprovalsList';
export { AuditLogList } from './AuditLogList';
export { default as Breadcrumbs } from './Breadcrumbs.astro';
export { DashboardKpis } from './DashboardKpis';
export { DataTable } from './DataTable';
export { EventsList } from './EventsList';
export { InvitesList } from './InvitesList';
export { KpiTile } from './KpiTile';
export { MembersList } from './MembersList';
export { default as PageShell } from './PageShell.astro';
export { PartnersList } from './PartnersList';
