import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuthentikClient, AuthentikError } from '../admin-invites/authentik.client';
import { DirectusClient, DirectusError } from '../directus/directus.client';
import { tzForCountry } from './country-tz';

// F-S4.1 — Country provisioning state machine.
//
// 4 steps walked sequentially when a super-admin provisions a new
// country. Each step is idempotent + retriable; failure on step N halts
// the chain, persists the error, and the next `run` call resumes from
// step N (after the operator addresses the underlying issue).
//
// v1 = framework only. Each step's runner is a STUB that logs intent
// and marks itself succeeded — the actual integrations (Authentik OIDC
// redirect URI registration, Directus permission policy creation,
// Plausible site creation, Coolify FQDN registration) land in subsequent
// PRs (F-S4.1-b/c/d). The framework being shippable on its own gives us
// the schema, the API surface, and the state-machine contract — operator
// UI work (F-S4.2 wizard) can build against it before integrations land.
//
// Per ADR-0033 + ADR-0031: the state machine ships under the operator
// cabinet route /workspace/admin/countries — operators never touch
// Directus admin or the underlying engines.

export const PROVISIONING_STEP_IDS = [
  'authentik_oidc',
  'directus_policy',
  'plausible_site',
  'coolify_fqdn',
] as const;

export type ProvisioningStepId = (typeof PROVISIONING_STEP_IDS)[number];

export type ProvisioningStepStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface ProvisioningStepState {
  status: ProvisioningStepStatus;
  attempted_at: string | null;
  error: string | null;
}

export interface ProvisioningState {
  started_at: string;
  completed_at: string | null;
  steps: Record<ProvisioningStepId, ProvisioningStepState>;
}

interface CountryRow {
  code: string;
  name: string;
  is_active: boolean;
  provisioning_state: ProvisioningState | null;
}

const COUNTRY_FIELDS = 'code,name,is_active,provisioning_state';

type StepRunner = (country: { code: string; name: string }) => Promise<void>;

@Injectable()
export class CountryProvisioningService {
  private readonly logger = new Logger(CountryProvisioningService.name);

  // All four step runners are real as of F-S4.1-d.
  private readonly runners: Record<ProvisioningStepId, StepRunner> = {
    authentik_oidc: (c) => this.runAuthentikOidc(c),
    directus_policy: (c) => this.runDirectusPolicy(c),
    plausible_site: (c) => this.runPlausibleSite(c),
    coolify_fqdn: (c) => this.runCoolifyFqdn(c),
  };

  constructor(
    private readonly directus: DirectusClient,
    private readonly authentik: AuthentikClient,
  ) {}

  // F-S4.1-b — register the new country's OIDC redirect URI on the
  // configured Authentik OAuth2 provider. Idempotent: if the URI is
  // already in the provider's list, no PATCH is sent.
  //
  // Error contract:
  //   * AUTHENTIK_OIDC_PROVIDER_NAME unset → authentik_oidc_provider_not_configured
  //   * Admin token unset → authentik_admin_not_configured
  //   * Provider name doesn't exist → authentik_oidc_provider_not_found
  //   * Network / 5xx from Authentik → AuthentikError propagates (the
  //     framework catches + persists the message into step.error)
  private async runAuthentikOidc(c: { code: string }): Promise<void> {
    if (!this.authentik.isConfigured()) {
      throw new Error('authentik_admin_not_configured');
    }
    // Read at runtime (not import time) so vi.stubEnv works in tests
    // without module-reset gymnastics. The schema entry in config/env.ts
    // documents + boot-validates the var.
    const providerName = process.env.AUTHENTIK_OIDC_PROVIDER_NAME;
    if (!providerName) {
      throw new Error('authentik_oidc_provider_not_configured');
    }
    const newUri = `https://${c.code}.aiqadam.org/api/v1/auth/callback`;
    const provider = await this.authentik.getOauthProviderByName(providerName);
    if (!provider) {
      throw new Error(`authentik_oidc_provider_not_found name=${providerName}`);
    }
    const existing = provider.redirect_uris ?? [];
    if (existing.some((entry) => entry.url === newUri)) {
      this.logger.log(
        `authentik_oidc — redirect URI already present provider=${providerName} country=${c.code}`,
      );
      return;
    }
    const next = [...existing, { matching_mode: 'strict' as const, url: newUri }];
    try {
      await this.authentik.setOauthProviderRedirectUris(provider.pk, next);
      this.logger.log(
        `authentik_oidc — appended redirect URI provider=${providerName} country=${c.code} now=${next.length}`,
      );
    } catch (err) {
      if (err instanceof AuthentikError) {
        throw new Error(`authentik_patch_failed status=${err.status}`);
      }
      throw err;
    }
  }

  // F-S4.1-c — create the per-country Directus policy that will gate
  // country_lead operators' access. Per ADR-0021 §4.1 + ADR-0033: the
  // global policy.country_lead defines the role's capability set
  // (organizer permissions + roster + sponsor pipeline + PII per
  // consent); per-country variants narrow it to one country via name
  // convention. Per-collection PERMISSIONS rows on this policy are
  // populated incrementally by the RBAC manifest sync (F-S2.2) — this
  // step just ensures the policy row exists so the sync has a target.
  //
  // Idempotent: lookup by exact name first; create only when missing.
  //
  // Error contract:
  //   * directus_policy_already_exists — never thrown; we short-circuit
  //     to success when found
  //   * any Directus 4xx/5xx surfaces via the framework's per-step
  //     persistence (the error message ends up in step.error)
  private async runDirectusPolicy(c: { code: string; name: string }): Promise<void> {
    const policyName = `policy.country_lead.${c.code}`;
    const description = `F-S4.1-c — per-country variant of policy.country_lead scoped to country=${c.code} (${c.name}). Per-collection permissions populated by F-S2.2 RBAC sync.`;
    // Lookup by exact name. Directus /policies supports filter[name][_eq]=.
    const filter = encodeURIComponent(JSON.stringify({ name: { _eq: policyName } }));
    const existing = await this.directus.get<{ data: Array<{ id: string }> }>(
      `/policies?filter=${filter}&fields=id&limit=1`,
    );
    if (existing.data.length > 0) {
      this.logger.log(
        `directus_policy — already exists country=${c.code} policy=${existing.data[0]?.id}`,
      );
      return;
    }
    const created = await this.directus.post<{ data: { id: string } }>('/policies', {
      name: policyName,
      icon: 'shield_person',
      description,
      admin_access: false,
      app_access: true,
      enforce_tfa: false,
    });
    this.logger.log(
      `directus_policy — created country=${c.code} policy=${created.data.id} name=${policyName}`,
    );
  }

  // F-S4.1-d — create the Plausible site for `<cc>.aiqadam.org`.
  // Plausible self-hosted admin API: `POST /api/v1/sites` with
  // `{ domain, timezone }`. Idempotent semantics: Plausible returns a
  // domain-already-exists error (HTTP 400/422) on conflict — we swallow
  // it as success because the goal state is satisfied either way.
  // Bearer-token auth; degraded mode when PLAUSIBLE_ADMIN_TOKEN unset.
  private async runPlausibleSite(c: { code: string }): Promise<void> {
    const token = process.env.PLAUSIBLE_ADMIN_TOKEN;
    if (!token) throw new Error('plausible_admin_not_configured');
    const adminUrl = process.env.PLAUSIBLE_ADMIN_URL ?? 'https://analytics.aiqadam.org';
    const domain = `${c.code}.aiqadam.org`;
    const timezone = tzForCountry(c.code);
    const body = new URLSearchParams({ domain, timezone });
    const res = await fetch(`${adminUrl.replace(/\/$/, '')}/api/v1/sites`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (res.ok) {
      this.logger.log(`plausible_site — created domain=${domain} tz=${timezone}`);
      return;
    }
    // Plausible returns 400 with `{error: "domain ... has already been taken"}`
    // when the site exists; treat as idempotent success.
    if (res.status === 400 || res.status === 422) {
      const text = await res.text();
      if (text.toLowerCase().includes('already')) {
        this.logger.log(`plausible_site — already exists domain=${domain}`);
        return;
      }
      throw new Error(`plausible_create_failed status=${res.status} ${text.slice(0, 120)}`);
    }
    throw new Error(`plausible_create_failed status=${res.status}`);
  }

  // F-S4.1-d — append `https://<cc>.aiqadam.org:<port>` to the
  // aiqadam-web Coolify application's domains list. Two-step:
  //   1. GET /api/v1/applications/<uuid> → read current `fqdn`
  //   2. PATCH /api/v1/applications/<uuid> with `{ domains: <comma-joined> }`
  // Coolify's PATCH field is `domains` (string, comma-separated); the
  // GET response field is `fqdn` (same shape).
  // Idempotent: if the entry is already present, no PATCH.
  // Bearer-token auth; degraded mode when token / app uuid unset.
  private async runCoolifyFqdn(c: { code: string }): Promise<void> {
    const token = process.env.COOLIFY_API_TOKEN;
    const appUuid = process.env.COOLIFY_WEB_APP_UUID;
    if (!token || !appUuid) throw new Error('coolify_admin_not_configured');
    const apiUrl = (process.env.COOLIFY_API_URL ?? 'https://coolify.aiqadam.org').replace(
      /\/$/,
      '',
    );
    const port = Number(process.env.COOLIFY_WEB_FQDN_PORT ?? 4321);
    const newFqdn = `https://${c.code}.aiqadam.org:${port}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    };
    const getRes = await fetch(`${apiUrl}/api/v1/applications/${appUuid}`, { headers });
    if (!getRes.ok) {
      throw new Error(`coolify_get_failed status=${getRes.status}`);
    }
    const app = (await getRes.json()) as { fqdn?: string };
    const current = (app.fqdn ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (current.includes(newFqdn)) {
      this.logger.log(`coolify_fqdn — already present country=${c.code} fqdn=${newFqdn}`);
      return;
    }
    const next = [...current, newFqdn].join(',');
    const patchRes = await fetch(`${apiUrl}/api/v1/applications/${appUuid}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ domains: next }),
    });
    if (!patchRes.ok) {
      throw new Error(`coolify_patch_failed status=${patchRes.status}`);
    }
    this.logger.log(
      `coolify_fqdn — appended country=${c.code} fqdn=${newFqdn} now=${current.length + 1}`,
    );
  }

  /**
   * Public API: run the state machine for `code`. Idempotent —
   * - If never provisioned, initialise state + run all 4 steps.
   * - If partially provisioned, resume from the first non-succeeded step.
   * - If fully provisioned, no-op.
   * Stops on the first failing step + returns the state including
   * the error so the operator UI can show "what went wrong".
   */
  async run(code: string): Promise<ProvisioningState> {
    const country = await this.fetchCountry(code);
    const state = country.provisioning_state ?? initialState();
    if (state.completed_at) return state;

    for (const stepId of PROVISIONING_STEP_IDS) {
      const step = state.steps[stepId];
      if (step.status === 'succeeded') continue;
      step.status = 'running';
      step.attempted_at = new Date().toISOString();
      step.error = null;
      try {
        await this.runners[stepId]({ code: country.code, name: country.name });
        step.status = 'succeeded';
      } catch (err) {
        step.status = 'failed';
        step.error = err instanceof Error ? err.message : 'unknown';
        await this.persistState(country.code, state);
        return state;
      }
    }
    state.completed_at = new Date().toISOString();
    await this.persistState(country.code, state);
    return state;
  }

  async getState(code: string): Promise<ProvisioningState | null> {
    const country = await this.fetchCountry(code);
    return country.provisioning_state;
  }

  async getStateWithActive(
    code: string,
  ): Promise<{ state: ProvisioningState | null; is_active: boolean }> {
    const country = await this.fetchCountry(code);
    return { state: country.provisioning_state, is_active: country.is_active };
  }

  // F-S4.2-b — explicit go-live gate. Operators flip `is_active=true`
  // ONLY after every provisioning step has succeeded. Without this gate
  // a super-admin could activate a country that nobody can reach
  // (no DNS, no OIDC redirect, no Directus policy).
  //
  // Error contract:
  //   * not yet provisioned (no state row) → BadRequest(not_provisioned)
  //   * any step !== succeeded → BadRequest(provisioning_incomplete)
  //   * already active → returns current row unchanged (idempotent)
  async activate(code: string): Promise<{ state: ProvisioningState; is_active: boolean }> {
    const country = await this.fetchCountry(code);
    const state = country.provisioning_state;
    if (!state || !state.completed_at) {
      throw new BadRequestException('not_provisioned');
    }
    const allOk = PROVISIONING_STEP_IDS.every((id) => state.steps[id]?.status === 'succeeded');
    if (!allOk) {
      throw new BadRequestException('provisioning_incomplete');
    }
    if (country.is_active) {
      return { state, is_active: true };
    }
    await this.directus.patch(`/items/countries/${encodeURIComponent(country.code)}`, {
      is_active: true,
    });
    this.logger.log(`activate — country=${country.code} flipped is_active=true`);
    return { state, is_active: true };
  }

  private async fetchCountry(code: string): Promise<CountryRow> {
    const normalized = code.trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(normalized)) {
      throw new NotFoundException(`country ${code} not found`);
    }
    try {
      const res = await this.directus.get<{ data: CountryRow }>(
        `/items/countries/${encodeURIComponent(normalized)}?fields=${COUNTRY_FIELDS}`,
      );
      if (!res.data) throw new NotFoundException(`country ${normalized} not found`);
      return res.data;
    } catch (err) {
      if (err instanceof DirectusError && err.status === 404) {
        throw new NotFoundException(`country ${normalized} not found`);
      }
      throw err;
    }
  }

  private async persistState(code: string, state: ProvisioningState): Promise<void> {
    await this.directus.patch(`/items/countries/${encodeURIComponent(code)}`, {
      provisioning_state: state,
    });
  }
}

function initialState(): ProvisioningState {
  const stepEntries = PROVISIONING_STEP_IDS.map(
    (id) =>
      [
        id,
        { status: 'pending' as ProvisioningStepStatus, attempted_at: null, error: null },
      ] as const,
  );
  return {
    started_at: new Date().toISOString(),
    completed_at: null,
    steps: Object.fromEntries(stepEntries) as Record<ProvisioningStepId, ProvisioningStepState>,
  };
}
