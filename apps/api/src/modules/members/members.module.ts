// Members module — FR-MIG-020 onboarding funnel.
//
// Registers MembersOnboardingController and MembersOnboardingService.
// Cross-module dependencies are injected through the module imports:
import { Module } from '@nestjs/common';
import { MeProfileModule } from '../me-profile/me-profile.module';
import { PointsModule } from '../points/points.module';
import { MembersOnboardingController } from './onboarding.controller';
import { MembersOnboardingService } from './onboarding.service';

@Module({
  imports: [MeProfileModule, PointsModule],
  providers: [MembersOnboardingService],
  controllers: [MembersOnboardingController],
  exports: [MembersOnboardingService],
})
export class MembersModule {}
