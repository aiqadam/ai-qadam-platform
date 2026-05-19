import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { EulaService, type ResolvedEula } from './eula.service';

// Sprint 5.5/7 — read-only consent prompt endpoint.
//
// The web/bot calls this before showing the "Register" button. If
// `eula` is null, no prompt is needed — the registration flow is
// unchanged. If non-null, the UI surfaces the EULA + the checkboxes
// for required_consents, then posts the acceptance block alongside
// the register call.
//
// Auth: standard AuthGuard. Anonymous browsers can't preview the EULA
// for an event yet (signed-in users only) — acceptable since you have
// to be authenticated to register anyway.

interface ConsentPromptResponse {
  eula: {
    eulaId: string;
    slug: string;
    version: string;
    locale: string;
    title: string;
    bodyMarkdown: string;
    requiredConsents: string[];
  } | null;
}

@Controller('v1/events')
@UseGuards(AuthGuard)
export class EulaController {
  constructor(private readonly eula: EulaService) {}

  @Get(':eventId/consent-prompt')
  async consentPrompt(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ): Promise<ConsentPromptResponse> {
    const resolved: ResolvedEula | null = await this.eula.resolveForEvent(eventId);
    return { eula: resolved };
  }
}
