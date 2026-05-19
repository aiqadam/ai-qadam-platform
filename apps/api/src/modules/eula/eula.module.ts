import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { EulaController } from './eula.controller';
import { EulaService } from './eula.service';

@Module({
  imports: [DirectusModule, AuthModule],
  providers: [EulaService],
  controllers: [EulaController],
  exports: [EulaService],
})
export class EulaModule {}
