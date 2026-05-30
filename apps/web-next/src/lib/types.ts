// Shared cross-layer types.
//
// Lives outside lib/api-* deliberately so L3 blocks can import the
// shape of data they receive without tripping ADR-0038 §Locks #1
// (which blocks runtime imports of lib/api-*). The intent of the
// lock — "blocks must receive data via props, not fetch their own" —
// is preserved: this file exports interfaces only, no fetchers.
//
// Each new endpoint adds its public payload type here. The fetcher
// in lib/api-ssr.ts or the hook in lib/api-queries.ts re-exports
// for back-compat at the call site.

// ---------------------------------------------------------------------------
// apps/api — events
// ---------------------------------------------------------------------------

export interface ApiEvent {
  id: string;
  title: string;
  description: string;
  format: 'meetup' | 'workshop' | 'hackathon' | 'conference' | 'online';
  status: 'draft' | 'published' | 'cancelled';
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  registeredCount: number;
  location: string | null;
  countryCode: string;
  shortDescription?: string | null;
  slug?: string | null;
  venue?: string | null;
  address?: string | null;
  heroImageUrl?: string | null;
  agendaMd?: string | null;
  visibilityScope?: 'public' | 'members_only' | 'invite_only' | null;
  externalLinks?: Array<{
    label: string;
    url: string;
    kind?: 'website' | 'registration' | 'sponsor' | 'livestream' | 'recording' | 'other' | null;
  }> | null;
}

// ---------------------------------------------------------------------------
// Directus — event-detail joins (speakers, materials, sponsors)
// ---------------------------------------------------------------------------

export interface EventSpeaker {
  id: string;
  displayName: string | null;
  handle: string | null;
  jobTitle: string | null;
  talkTitle: string | null;
  bioMd: string | null;
  status: 'invited' | 'accepted' | 'confirmed' | 'declined' | 'cancelled';
  orderIndex: number;
}

export interface EventMaterial {
  id: string;
  title: string;
  kind: 'slides' | 'handout' | 'cheatsheet' | 'recording' | 'code' | 'other';
  fileUrl: string | null;
  url: string | null;
  orderIndex: number;
}

export interface EventSponsor {
  id: string;
  tier: 'presenting' | 'gold' | 'silver' | 'bronze' | 'community';
  customMessage: string | null;
  orderIndex: number;
  sponsor: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    website: string | null;
  };
}

// ---------------------------------------------------------------------------
// Directus — per-event Q&A thread (anon read, signed-in post).
//
// Backs <ForumThread> on /events/[id]. Pinned questions float to the
// top; non-pinned sort newest-first. parentQuestionId is reserved for
// the future deep-thread tree but renders flat in v1 (matches v1 web).
// ---------------------------------------------------------------------------

export interface EventQuestion {
  id: string;
  questionText: string;
  parentQuestionId: string | null;
  isPinned: boolean;
  isAnswered: boolean;
  createdAt: string;
  author: {
    displayName: string | null;
    directusUserId: string | null;
  };
}

// ---------------------------------------------------------------------------
// apps/api — public profiles (/u/[handle])
// ---------------------------------------------------------------------------

export interface PublicProfile {
  handle: string;
  displayName: string | null;
  // Headline stats — surfaced on the profile page header.
  attendedCount: number;
  registeredCount: number;
  totalPoints: number;
  // Enrichment fields. Always present in the response; null when the
  // underlying directus_users column / FK is unset.
  bioMd: string | null;
  jobTitle: string | null;
  employerName: string | null;
  // Tenant-scoped attended events, newest-first, cap 50. Powers the
  // recent-events list + (future) activity heatmap.
  recentEvents: Array<{
    eventId: string;
    title: string;
    startsAt: string;
    endsAt: string;
  }>;
}

// ---------------------------------------------------------------------------
// apps/api — /v1/me/profile (signed-in self-edit surface).
//
// Backs /me/profile blocks: <ConsentList>, <SkillTagger>. Future
// editors (interests, employments, profile core) ride on the same
// envelope.
// ---------------------------------------------------------------------------

export const CONSENT_PURPOSES = [
  'events',
  'marketing',
  'research',
  'recruiting',
  'sponsor_share',
  'content',
  'paid_premium',
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export interface ConsentSummary {
  purpose: ConsentPurpose;
  granted: boolean;
  lastChangedAt: string | null;
}

export interface MemberSkill {
  id: string;
  skill_tag: string;
  endorsement_count: number;
  verified_by_event: string | null;
}

export interface MeProfileCore {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  seniority: string | null;
  industry_tags: string[];
  is_student: boolean;
  bio_md: string | null;
  appear_in_directory: boolean;
  appear_in_matches: boolean;
  appear_on_attendee_list: boolean;
  appear_on_public_leaderboard: boolean;
  show_company_on_public_profile: boolean;
}

export interface MeProfileFull {
  profile: MeProfileCore;
  consents: ConsentSummary[];
  skills: MemberSkill[];
}

// ---------------------------------------------------------------------------
// apps/api — /v1/leaderboard
// ---------------------------------------------------------------------------

export const LEADERBOARD_WINDOWS = ['all', 'year', 'quarter'] as const;
export type LeaderboardWindow = (typeof LEADERBOARD_WINDOWS)[number];

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  email: string;
  displayName: string | null;
  handle: string | null;
  totalPoints: number;
}

// ---------------------------------------------------------------------------
// apps/api — /v1/workspace/members (operator-facing member directory)
//
// Backs the Members cabinet under /workspace/members. Per ADR-0033
// operators NEVER touch Directus admin; this is the surface that
// replaces it for search/filter/cohort workflows. PR 2.2 ships the
// read-only list with paginated DataTable; filters + cohorts come in
// follow-ups.
// ---------------------------------------------------------------------------

// `display_name` is intentionally absent — see members.service.ts
// header note. The field doesn't exist on directus_users; the cabinets
// render `first_name` for the Name column.
export interface MemberRow {
  id: string;
  email: string;
  first_name?: string | null;
  job_title?: string | null;
  seniority?: string | null;
  city?: string | null;
  industry?: string[] | null;
  is_student?: boolean | null;
  appear_in_directory?: boolean | null;
  state?: string | null;
}

export interface MemberSearchResult {
  members: MemberRow[];
  total: number;
  page: number;
  limit: number;
}

// Preview of an operator announcement — returned by POST
// /v1/workspace/announce/preview. `estimatedRecipients` is the live
// audience size (cohort filter + capped at MembersService.MAX_DISPATCH);
// `truncated` is true if the cohort exceeds the cap. `text` is the
// API-rendered body (plain-text + minimal HTML).
export interface AnnouncePreview {
  cohortName: string;
  estimatedRecipients: number;
  truncated: boolean;
  subject: string;
  text: string;
}

// Result of POST /v1/workspace/announce — returned after the
// dispatcher fires. Carries a per-state delivery breakdown so the
// cabinet can show "X sent, Y skipped for consent" inline.
export interface AnnounceSent {
  interactionId: string;
  recipientCount: number;
  truncated: boolean;
  deliveriesSummary: {
    sent: number;
    skipped_consent: number;
    failed: number;
    other: number;
  };
}

// Per-step state of the country-provisioning machine — mirrors the API
// `ProvisioningStepState` shape (apps/api/src/modules/country-
// provisioning/country-provisioning.service.ts). `attempted_at` is null
// until the first run; `error` carries the last failure's message
// (cleared on a successful re-attempt).
export interface ProvisioningStepState {
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'awaiting_manual';
  attempted_at: string | null;
  error: string | null;
}

// Whole provisioning state for a country. `completed_at` is set only
// when ALL steps are `succeeded`; `awaiting_manual` blocks completion.
// The `steps` map is keyed by step id (authentik_oidc, directus_policy,
// plausible_site, coolify_fqdn).
export interface ProvisioningState {
  started_at: string;
  completed_at: string | null;
  steps: Record<string, ProvisioningStepState>;
}

// Wrapper returned by GET /v1/admin/countries/:code/provisioning —
// `state` is null until the first /run; `is_active` flips on /activate
// (only legal once every step is `succeeded`).
export interface ProvisioningEnvelope {
  state: ProvisioningState | null;
  is_active: boolean;
}

// A saved cohort = a named, reusable Directus filter against members.
// `filter_query` is the same shape MembersService.search consumes (and
// the announce dispatcher's audience resolver), so loading a cohort into
// the cabinet is a zero-translation hop. `member_count_cached` is
// refreshed by cron + on-write; the UI reads it without re-evaluating.
export interface CohortRow {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  filter_query: Record<string, unknown>;
  created_by?: string | null;
  member_count_cached: number;
  member_count_refreshed_at?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
}

// ---------------------------------------------------------------------------
// apps/api — /v1/admin/invites (super-admin operator-onboarding cabinet)
//
// ADR-0035: invite-link flow replaces CLI user-create. Super-admin lists
// pending/consumed/revoked invites + creates new ones. The operator's
// @aiqadam.org mailbox is provisioned automatically via DMS+LDAP at
// consume time (F-S2.12 cleanup, 2026-05-25 — dropped the old F-S2.8.x
// Cloudflare Email Routing + Resend per-operator-key flow).
// ---------------------------------------------------------------------------

export const INVITE_ROLE_GROUPS = [
  'aiqadam-super-admin',
  'aiqadam-staff',
  'country_lead_uz',
  'country_lead_kz',
  'country_lead_tj',
] as const;
export type InviteRoleGroup = (typeof INVITE_ROLE_GROUPS)[number];

export const INVITE_DELIVERY_CHANNELS = ['email', 'telegram', 'copy_paste'] as const;
export type InviteDeliveryChannel = (typeof INVITE_DELIVERY_CHANNELS)[number];

export const INVITE_COUNTRIES = ['uz', 'kz', 'tj', 'xx'] as const;
export type InviteCountry = (typeof INVITE_COUNTRIES)[number];

export type InviteStatus = 'pending' | 'consumed' | 'revoked' | 'expired';

export interface InviteSummary {
  id: string;
  email: string;
  display_name: string | null;
  role_groups: InviteRoleGroup[];
  country: InviteCountry | null;
  status: InviteStatus;
  token_prefix: string;
  created_at: string;
  expires_at: string;
  delivery_channel: InviteDeliveryChannel | null;
}

export interface CreateInviteBody {
  email: string;
  display_name: string;
  role_groups: InviteRoleGroup[];
  delivery_channel: InviteDeliveryChannel;
  country?: InviteCountry;
  notes?: string;
}

export interface CreateInviteResult {
  invite_id: string;
  invite_url: string;
  token_prefix: string;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// apps/api — /v1/workspace/dashboard (operator KPI dashboard)
//
// Country-scoped event / registration / attendance / CSAT counters.
// Powers the /workspace/dashboard cabinet KPI grid.
// ---------------------------------------------------------------------------

export const COUNTRY_CODES = ['uz', 'kz', 'tj', 'xx'] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export interface CountryMetrics {
  country: CountryCode;
  range_days: number;
  events_count: number;
  registrations_count: number;
  attended_count: number;
  csat_avg: number | null;
  csat_count: number;
}

// ---------------------------------------------------------------------------
// apps/api — /v1/admin/audit (super-admin audit log)
//
// Append-only log of operator actions + selected member actions.
// Per ADR-0033 the full payload + actor are only visible to super-admin;
// /v1/me/access-log returns a redacted slice for the member themselves.
// ---------------------------------------------------------------------------

export const AUDIT_SEVERITIES = ['info', 'high', 'critical'] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

export interface AuditEventSummary {
  id: string;
  event: string;
  severity: AuditSeverity;
  actor_id: string | null;
  actor_email: string | null;
  target_kind: string | null;
  target_id: string | null;
  country: string | null;
  payload_json: Record<string, unknown> | null;
  ts: string;
}

// ---------------------------------------------------------------------------
// apps/api — /v1/workspace/partners (sponsor + employer + product-partner directory)
//
// F-S3.5 cabinet — operator-visible directory of partners. The same
// row spans sponsor / employer / product-partner roles via the
// is_* flags; the cabinet renders all three with role chips.
// ---------------------------------------------------------------------------

export type PartnerStatus = 'active' | 'pending' | 'archived';

export interface PartnerSummary {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  industry: string | null;
  website: string | null;
  is_sponsor: boolean;
  is_employer: boolean;
  is_product_partner: boolean;
  status: PartnerStatus;
}

// Per-partner detail (GET /v1/workspace/partners/:slug). Read-only —
// the API exposes no PATCH for partners (onboarding still happens in
// Directus). `audiences` = consented cohort shares; `kit_assets` =
// co-marketing assets scoped to this partner + the shared sponsor pool.
export interface PartnerAudienceSummary {
  id: string;
  cohort_id: string;
  cohort_name: string;
  member_count: number;
  purpose: string;
  granted_at: string;
  expires_at: string | null;
}

export interface PartnerKitAsset {
  id: string;
  category: string;
  title: string;
  file_url: string | null;
  is_partner_exclusive: boolean;
}

export interface PartnerDetail extends PartnerSummary {
  audiences: PartnerAudienceSummary[];
  kit_assets: PartnerKitAsset[];
}

// ---------------------------------------------------------------------------
// apps/api — /v1/workspace/approvals (operator approval queue)
//
// F-S3.7 cabinet — pending sponsor onboardings, speaker proposals,
// operator-assisted interactions. v1 ships the queue framework with
// three source kinds; each source flips `ready: true` once its
// loader lands.
// ---------------------------------------------------------------------------

export const APPROVAL_KINDS = [
  'sponsor_onboarding',
  'speaker_proposal',
  'operator_assisted_interaction',
] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export interface ApprovalItem {
  id: string;
  kind: ApprovalKind;
  title: string;
  submittedAt: string;
  summary: string;
  href: string;
}

export interface ApprovalsResult {
  items: ApprovalItem[];
  sources: Array<{ kind: ApprovalKind; ready: boolean; note: string }>;
}

// ---------------------------------------------------------------------------
// apps/api — /v1/workspace/events (operator event control panel)
//
// Naming: prefixed `Workspace*` since the customer-facing /v1/events
// endpoint already exposes `ApiEvent` with a narrower schema. The
// workspace shape adds RegistrationCounts + raw status.
// ---------------------------------------------------------------------------

export const WORKSPACE_EVENT_STATUSES = ['draft', 'published', 'cancelled'] as const;
export type WorkspaceEventStatus = (typeof WORKSPACE_EVENT_STATUSES)[number];

export interface WorkspaceRegistrationCounts {
  registered: number;
  waitlisted: number;
  cancelled: number;
  attended: number;
}

export interface WorkspaceEventListItem {
  id: string;
  title: string;
  description: string;
  status: WorkspaceEventStatus;
  format: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  location: string | null;
  country: string;
  date_created: string;
  date_updated: string | null;
  post_event_survey_form?: string | null;
  counts: WorkspaceRegistrationCounts;
}

// Per-event detail (GET /v1/workspace/events/:id) + the editable
// followups checklist. Backs the events/[id] operator control panel.
export const EVENT_FOLLOWUP_KINDS = [
  'retrospective',
  'thank_you_sent',
  'recap_posted',
  'sponsor_report_delivered',
] as const;
export type EventFollowupKind = (typeof EVENT_FOLLOWUP_KINDS)[number];

export interface WorkspaceEventFollowup {
  id: string;
  kind: EventFollowupKind;
  body_md: string | null;
  due_at: string | null;
  completed_at: string | null;
}

export interface WorkspaceEventDetail extends WorkspaceEventListItem {
  followups: WorkspaceEventFollowup[];
}

// PATCH /v1/workspace/events/:id — every field optional; null clears
// capacity / location / post_event_survey_form.
export interface UpdateEventBody {
  title?: string;
  description?: string;
  status?: WorkspaceEventStatus;
  starts_at?: string;
  ends_at?: string;
  capacity?: number | null;
  location?: string | null;
  post_event_survey_form?: string | null;
}

// ---------------------------------------------------------------------------
// apps/api — /v1/workspace/forms (operator forms-library cabinet)
//
// F-S2.10 cabinet — reusable form templates for post-event surveys,
// sponsor onboarding, etc. PR 2.7b ships the list view; per-form
// detail (builder + submissions inbox + aggregate) lands separately.
// ---------------------------------------------------------------------------

export const WORKSPACE_FORM_STATUSES = ['draft', 'published', 'archived'] as const;
export type WorkspaceFormStatus = (typeof WORKSPACE_FORM_STATUSES)[number];

export interface WorkspaceFormRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  country: string;
  status: WorkspaceFormStatus;
  allow_anonymous: boolean;
  schema: unknown;
  created_by: string | null;
  date_created: string;
  date_updated: string | null;
  submission_count: number;
}
