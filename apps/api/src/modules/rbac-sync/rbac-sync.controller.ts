import { BadRequestException, Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { RbacSyncService } from './rbac-sync.service';
import { RbacWebhookGuard } from './rbac-webhook.guard';

// F-S2.2-b (ADR-0021 §5) — Authentik notification transport POSTs here
// on Group.users model_updated events. Auth via URL-path secret
// (RbacWebhookGuard) — Authentik's Generic Webhook transport can't add
// custom auth headers, so the secret rides in the URL path.
//
// Authentik notification body template (configured in the notification
// transport's webhook_mapping):
//   { "user_pk": {{ event.user.pk }}, "action": "{{ model.action }}" }

const webhookPayloadSchema = z
  .object({
    user_pk: z.coerce.number().int().positive(),
    action: z.string().optional(),
  })
  .passthrough();

@Controller('v1/internal/rbac')
export class RbacSyncController {
  constructor(private readonly rbac: RbacSyncService) {}

  // URL contains the shared secret as the last path segment per the
  // RbacWebhookGuard contract. Operators configure the full URL once
  // in Authentik's notification transport; rotation = update env +
  // Authentik URL in lockstep.
  @Post('authentik-webhook/:secret')
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
