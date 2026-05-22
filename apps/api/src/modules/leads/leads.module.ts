import { Module } from '@nestjs/common';
import { DirectusModule } from '../directus/directus.module';
import { InteractionsModule } from '../interactions/interactions.module';
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

@Module({
  imports: [DirectusModule, InteractionsModule],
  providers: [LeadsService, LeadVerifyTokenService],
  controllers: [LeadsController],
  exports: [LeadsService],
})
export class LeadsModule {}
