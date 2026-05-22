import { Module } from '@nestjs/common';
import { TelegramController, TelegramPublicController } from './telegram.controller';

// Module shell. Subsequent PRs add the service layer (link, audit,
// outbox-relay) per ADR-0034 §"Sequenced PR plan". Kept intentionally
// thin so the foundation lands without coupling to features that may
// land out of order during A2–A6.
//
// Two controllers on the same path prefix — the public one exposes
// /health (no auth) so the bot can detect the degraded "not configured"
// state at boot. Everything else is gated by TelegramAuthGuard.
@Module({
  imports: [],
  controllers: [TelegramPublicController, TelegramController],
  providers: [],
})
export class TelegramModule {}
