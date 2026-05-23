import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

  // Each step's runner. v1 stubs log intent + succeed. F-S4.1-b/c/d swap
  // these for real implementations one at a time.
  private readonly runners: Record<ProvisioningStepId, StepRunner> = {
    authentik_oidc: async (c) => {
      this.logger.log(
        `[stub] authentik_oidc — would register OIDC redirect URI for https://${c.code}.aiqadam.org/api/v1/auth/callback`,
      );
    },
    directus_policy: async (c) => {
      this.logger.log(
        `[stub] directus_policy — would create country=${c.code} member-graph-scoped permission policy`,
      );
    },
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

  constructor(private readonly directus: DirectusClient) {}

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
