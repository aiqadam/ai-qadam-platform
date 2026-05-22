import { Module } from '@nestjs/common';
import { DirectusModule } from '../directus/directus.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { LeadNurtureCronController } from './lead-nurture-cron.controller';
import { LeadNurtureCronService } from './lead-nurture-cron.service';
import { LeadVerifyTokenService } from './lead-verify-token.service';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

// F-S1.6 — lead capture + 3-email nurture.
//
// PUBLIC endpoints (no AuthGuard — anonymous visitors submit the form):
//   POST /v1/leads               — anonymous, rate-limited, honeypotted
//   GET  /v1/leads/verify        — anonymous, HMAC-token gated
// INTERNAL endpoint (called from auth.controller.ts OIDC callback):
//   POST /v1/internal/leads/convert — INTERNAL_API_TOKEN-gated
//
// F-S1.6b — nurture cron.
// POST /v1/internal/lead-nurture/tick (InternalAuthGuard) dispatches T+3
// lead_nurture_value + T+7 lead_nurture_next_event for verified leads
// still in state='lead'. Idempotent via lead_nurture_dispatches ledger.

@Module({
  imports: [DirectusModule, InteractionsModule],
  providers: [LeadsService, LeadVerifyTokenService, LeadNurtureCronService, InternalAuthGuard],
  controllers: [LeadsController, LeadNurtureCronController],
  exports: [LeadsService],
})
export class LeadsModule {}
