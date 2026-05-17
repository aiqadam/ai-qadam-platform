import { Module } from '@nestjs/common';
import { DB, db } from '../../db';
import { UsersModule } from '../users/users.module';
import { AdminGuard } from './admin.guard';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { JtiRevocationService } from './jti-revocation.service';
import { JwtService } from './jwt.service';
import { oidcClientProvider } from './oidc-client.provider';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    { provide: DB, useValue: db },
    AuthService,
    JwtService,
    JtiRevocationService,
    RefreshTokenService,
    AuthGuard,
    AdminGuard,
    oidcClientProvider,
  ],
  exports: [JwtService, AuthGuard, AdminGuard],
})
export class AuthModule {}
