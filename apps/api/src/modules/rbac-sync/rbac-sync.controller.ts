import { BadRequestException, Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { RbacSyncService } from './rbac-sync.service';
import { RbacWebhookGuard } from './rbac-webhook.guard';

// F-S2.2-b (ADR-0021 §5) — Authentik notification transport POSTs here
// on Group.users model_updated events. HMAC verified upstream by
// RbacWebhookGuard.
//
// Authentik notification payload shape (simplified — Authentik nests
// the actual change inside a notification envelope; the relevant bits
// we care about are the affected user pk + the action verb):
//   { user_pk: number, action: "model_updated" | "model_created" | ... }
//
// Authentik's notification transport supports a custom JSON body
// template; the runbook (follow-up to F-S2.2-b) configures the template
// to send `{ "user_pk": {{ user.pk }}, "action": "{{ model.action }}" }`
// so the API receives a stable shape.

const webhookPayloadSchema = z
  .object({
    user_pk: z.coerce.number().int().positive(),
    action: z.string().optional(),
  })
  .passthrough();

@Controller('v1/internal/rbac')
export class RbacSyncController {
  constructor(private readonly rbac: RbacSyncService) {}

  @Post('authentik-webhook')
  @UseGuards(RbacWebhookGuard)
  @HttpCode(202)
  async webhook(@Body() body: unknown): Promise<{ accepted: true; job_id: string }> {
    const parsed = webhookPayloadSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'payload_invalid',
        details: parsed.error.flatten(),
      });
    }
    const result = await this.rbac.intakeWebhook({
      userPk: parsed.data.user_pk,
      triggeredBy: 'webhook',
    });
    return { accepted: true, job_id: result.job_id };
  }

  // F-S2.2-f — nightly poll entrypoint. External scheduler (GH Actions
  // cron or host systemd timer) POSTs once per night to catch missed
  // webhooks + hand-edits per ADR-0021 §5.
  @Post('poll')
  @UseGuards(InternalAuthGuard)
  @HttpCode(200)
  async poll(): Promise<{ scanned: number; jobs_created: number; errors: number }> {
    return this.rbac.pollAllUsers();
  }
}
