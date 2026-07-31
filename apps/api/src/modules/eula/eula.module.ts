import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { EulaController } from './eula.controller';
import { EulaService } from './eula.service';

// FEAT-BOT-2 (FR-BOT-002 PR 2/6): forwardRef added — EulaModule is now
// reachable from AuthModule via AuthModule -> RegistrationsModule ->
// EulaModule -> AuthModule (RegistrationsModule imports EulaModule for
// EulaService; see registrations.module.ts's own comment on the new
// AuthModule <-> RegistrationsModule cycle this PR introduces). Same
// UndefinedModuleException class caught live at boot (`pnpm --filter api
// dev`), same fix.
@Module({
  imports: [DirectusModule, forwardRef(() => AuthModule)],
  providers: [EulaService],
  controllers: [EulaController],
  exports: [EulaService],
})
export class EulaModule {}
