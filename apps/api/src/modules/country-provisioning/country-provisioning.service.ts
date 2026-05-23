import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuthentikClient, AuthentikError } from '../admin-invites/authentik.client';
import { DirectusClient, DirectusError } from '../directus/directus.client';

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
  provisioning_state: ProvisioningState | null;
}

const COUNTRY_FIELDS = 'code,name,provisioning_state';

type StepRunner = (country: { code: string; name: string }) => Promise<void>;

@Injectable()
export class CountryProvisioningService {
  private readonly logger = new Logger(CountryProvisioningService.name);

  // Each step's runner. F-S4.1-b/c/d swap stubs for real implementations
  // one at a time. authentik_oidc + directus_policy are real as of
  // F-S4.1-b + F-S4.1-c respectively; plausible_site + coolify_fqdn
  // remain stubs (slated for F-S4.1-d).
  private readonly runners: Record<ProvisioningStepId, StepRunner> = {
    authentik_oidc: (c) => this.runAuthentikOidc(c),
    directus_policy: (c) => this.runDirectusPolicy(c),
    plausible_site: async (c) => {
      this.logger.log(
        `[stub] plausible_site — would create Plausible site for ${c.code}.aiqadam.org`,
      );
    },
    coolify_fqdn: async (c) => {
      this.logger.log(
        `[stub] coolify_fqdn — would add https://${c.code}.aiqadam.org to aiqadam-web fqdn list`,
      );
    },
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
