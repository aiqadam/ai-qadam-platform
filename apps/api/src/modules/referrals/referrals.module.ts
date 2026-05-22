import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

// F-S3.9 — referral codes + attribution. Resolves ?ref=CODE → owner_user_id;
// registrations.controller is responsible for stamping resolved value +
// acquisition_source onto registrations.referred_by / acquisition_source
// (see registrations module).

@Module({
  imports: [DirectusModule, AuthModule],
  providers: [ReferralsService],
  controllers: [ReferralsController],
  exports: [ReferralsService],
})
export class ReferralsModule {}
