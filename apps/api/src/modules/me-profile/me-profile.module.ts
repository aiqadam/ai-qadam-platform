import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { MeProfileController } from './me-profile.controller';
import { MeProfileService } from './me-profile.service';

@Module({
  imports: [DirectusModule, AuthModule],
  providers: [MeProfileService],
  controllers: [MeProfileController],
  exports: [MeProfileService],
})
export class MeProfileModule {}
