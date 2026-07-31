import { Module, forwardRef } from '@nestjs/common';
import { DB, db } from '../../db';
import { AuthentikModule } from '../admin-invites/authentik.module';
import { DirectusModule } from '../directus/directus.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { LeadsModule } from '../leads/leads.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import { UsersModule } from '../users/users.module';
import { AuthController, TelegramInternalController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { JtiRevocationService } from './jti-revocation.service';
import { JwtService } from './jwt.service';
import { oidcClientProvider } from './oidc-client.provider';
import { RefreshTokenService } from './refresh-token.service';
import { RegistrationService } from './registration.service';
import { TelegramAuthService } from './telegram-auth.service';

// FEAT-BOT-2 (FR-BOT-002 PR 2/6): RegistrationsModule is imported so
// TelegramAuthService can inject RegistrationsDirectusService directly for
// the bot's /register, /cancel internal routes (reuse, not duplicate —
// see registrations-directus.service.ts's own capacity/waitlist header
// comment). RegistrationsModule already imports AuthModule (for
// AuthGuard), so this new edge closes a cycle — forwardRef here breaks it,
// exactly the same shape and fix as telegram.module.ts's documented
// "Circular-dep gotcha" (AuthModule -> InteractionsModule -> TelegramModule
// -> AuthModule). RegistrationsModule's own import of AuthModule does NOT
// need a matching forwardRef, per that same precedent — only the side that
// introduces the new edge wraps it.
@Module({
  imports: [
    UsersModule,
    DirectusModule,
    LeadsModule,
    AuthentikModule,
    InteractionsModule,
    forwardRef(() => RegistrationsModule),
  ],
  controllers: [AuthController, TelegramInternalController],
  providers: [
    { provide: DB, useValue: db },
    AuthService,
    JwtService,
    JtiRevocationService,
    RefreshTokenService,
    AuthGuard,
    oidcClientProvider,
    TelegramAuthService,
    RegistrationService,
  ],
  exports: [JwtService, AuthGuard],
})
export class AuthModule {}
