import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { EmailModule } from '../email/email.module';
import { BadgeAwarderService } from './badge-awarder.service';
import { BadgesInternalController } from './badges-internal.controller';
import { BadgesController } from './badges.controller';

// FEAT-BOT-2 (FR-BOT-002 PR 2/6): forwardRef added — BadgesModule is now
// reachable from AuthModule via AuthModule -> RegistrationsModule ->
// BadgesModule -> AuthModule (RegistrationsModule imports BadgesModule for
// BadgeAwarderService; see registrations.module.ts's own comment on the
// new AuthModule <-> RegistrationsModule cycle this PR introduces). Same
// UndefinedModuleException class caught live at boot (`pnpm --filter api
// dev`), same fix.
@Module({
  imports: [forwardRef(() => AuthModule), DirectusModule, EmailModule],
  controllers: [BadgesController, BadgesInternalController],
  providers: [BadgeAwarderService],
  exports: [BadgeAwarderService],
})
export class BadgesModule {}
