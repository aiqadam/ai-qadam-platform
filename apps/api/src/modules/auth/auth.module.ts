import { Module } from '@nestjs/common';
import { DB, db } from '../../db';
import { AuthentikModule } from '../admin-invites/authentik.module';
import { DirectusModule } from '../directus/directus.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { LeadsModule } from '../leads/leads.module';
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

@Module({
  imports: [UsersModule, DirectusModule, LeadsModule, AuthentikModule, InteractionsModule],
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
