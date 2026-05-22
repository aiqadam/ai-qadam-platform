import { Controller, Get, UseGuards } from '@nestjs/common';
import { env } from '../../config/env';
import { TelegramAuthGuard } from './telegram-auth.guard';

// Sync surface (OpenAPI) for the AI Qadam Telegram bot + notifier per
// ADR-0034. Endpoints land in subsequent PRs (A2 link/*, A4 audit, etc).
//
// Split into two controllers on the same path prefix so /health can be
// reached without the service token (the bot uses it to detect the
// degraded "not configured" state at boot). Everything else is gated.

@Controller('v1/telegram')
export class TelegramPublicController {
  // Ungated health probe.
  //
  // The bot hits this at boot to learn whether the platform considers
  // telegram configured. Returns 200 always — the `configured` field
  // tells the bot whether to proceed (start long-poll + /whoami check)
  // or stop and surface the dormant state to operators. `configured`
  // doesn't leak the token itself.
  @Get('health')
  health(): {
    ok: true;
    module: 'telegram';
    version: 'v1';
    configured: boolean;
  } {
    return {
      ok: true,
      module: 'telegram',
      version: 'v1',
      configured: Boolean(env.TELEGRAM_BOT_SERVICE_TOKEN),
    };
  }
}

@Controller('v1/telegram')
@UseGuards(TelegramAuthGuard)
export class TelegramController {
  // Gated probe. The bot hits this after /health reports configured=true
  // to verify its service token works. 200 = token good. 401 = wrong
  // token. 503 = telegram_not_configured (the guard returns it even when
  // /health says configured=true, e.g. race during a token rotation).
  @Get('whoami')
  whoami(): { authenticated: true; module: 'telegram' } {
    return { authenticated: true, module: 'telegram' };
  }
}
