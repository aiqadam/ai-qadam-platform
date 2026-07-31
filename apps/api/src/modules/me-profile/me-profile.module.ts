import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { MeProfileController } from './me-profile.controller';
import { MeProfileService } from './me-profile.service';

// FEAT-BOT-2 (FR-BOT-002 PR 5/6): AuthModule now also imports THIS module
// (forwardRef(() => MeProfileModule), to reuse MeProfileService for the
// bot's /interests internal routes) — see auth.module.ts's own comment.
// This module's own import of AuthModule (below, for AuthGuard) ALSO
// needs forwardRef, not just AuthModule's new edge — same live-boot
// failure already documented and fixed once for the analogous
// AuthModule <-> RegistrationsModule cycle (see registrations.module.ts's
// header comment): Nest's scanner reaches AuthModule via a second,
// pre-existing path (AuthModule -> LeadsModule -> InteractionsModule ->
// TelegramModule -> AuthModule) before it reaches this module's
// forwardRef-wrapped import of MeProfileModule, so a plain (non-forwardRef)
// import here still resolves to undefined at that point in the scan.
// Confirmed via the full apps/api test suite (main-bootstrap.spec.ts's
// live bootstrap check caught UndefinedModuleException at MeProfileModule
// imports[1] before this fix) — typecheck alone did not catch it, since
// Nest's module graph is resolved at runtime, not by tsc.
@Module({
  imports: [DirectusModule, forwardRef(() => AuthModule)],
  providers: [MeProfileService],
  controllers: [MeProfileController],
  exports: [MeProfileService],
})
export class MeProfileModule {}
