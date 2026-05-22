import { Module } from '@nestjs/common';
import { DB, db } from '../../db';
import { DirectusModule } from '../directus/directus.module';
import { LeadsModule } from '../leads/leads.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { JtiRevocationService } from './jti-revocation.service';
import { JwtService } from './jwt.service';
import { oidcClientProvider } from './oidc-client.provider';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  imports: [UsersModule, DirectusModule, LeadsModule],
  controllers: [AuthController],
  providers: [
    { provide: DB, useValue: db },
    AuthService,
    JwtService,
    JtiRevocationService,
    RefreshTokenService,
    AuthGuard,
    oidcClientProvider,
  ],
  exports: [JwtService, AuthGuard],
})
export class AuthModule {}
