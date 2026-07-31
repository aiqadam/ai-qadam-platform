import { Module, forwardRef } from '@nestjs/common';
import { DB, db } from '../../db';
import { AuthentikModule } from '../admin-invites/authentik.module';
import { DirectusModule } from '../directus/directus.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { LeadsModule } from '../leads/leads.module';
import { MeProfileModule } from '../me-profile/me-profile.module';
import { PointsModule } from '../points/points.module';
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
//
// FEAT-BOT-2 (FR-BOT-002 PR 3/6): PointsModule is imported plainly (no
// forwardRef) — unlike RegistrationsModule, PointsModule does not import
// AuthModule anywhere in its own module graph (confirmed by reading
// points.module.ts: it only imports DirectusModule), so there is no cycle
// to break here.
//
// FEAT-BOT-2 (FR-BOT-002 PR 5/6): MeProfileModule is imported so
// TelegramAuthService can inject MeProfileService directly for the bot's
// /interests internal routes (reuse of the exact same
// listInterests/addInterest/removeInterest surface the web /me/profile
// cabinet already uses — see me-profile.service.ts, no duplicate write
// path). MeProfileModule already imports AuthModule
// (me-profile.module.ts), so this new edge closes a second, independent
// AuthModule <-> X <-> AuthModule cycle — same shape as the
// RegistrationsModule edge above. Unlike that initial assumption, BOTH
// sides need forwardRef here, not just this one: a live full-suite run
// (main-bootstrap.spec.ts) hit UndefinedModuleException at MeProfileModule
// imports[1] with only this side wrapped, because Nest's scanner reaches
// AuthModule via a second, pre-existing path (AuthModule -> LeadsModule ->
// InteractionsModule -> TelegramModule -> AuthModule) before it reaches
// MeProfileModule's forwardRef-wrapped import of AuthModule — the exact
// same failure mode registrations.module.ts's own header comment already
// documents for the RegistrationsModule edge. me-profile.module.ts now
// also wraps its AuthModule import in forwardRef(() => AuthModule). This
// corrects 01-requirement-validation.md's "only the side that introduces
// the new edge wraps it" claim, which held for the ORIGINAL
// RegistrationsModule edge only because that finding was itself written
// before the live-boot fix above was discovered — see
// registrations.module.ts's header comment for the original discovery.
// MeProfileService is already exported from MeProfileModule
// (`exports: [MeProfileService]`) — no change needed on that side.
@Module({
  imports: [
    UsersModule,
    DirectusModule,
    LeadsModule,
    AuthentikModule,
    InteractionsModule,
    PointsModule,
    forwardRef(() => RegistrationsModule),
    forwardRef(() => MeProfileModule),
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
