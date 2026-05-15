import { Module } from '@nestjs/common';
import './modules/tenants/tenant.types';
import { HealthController } from './health/health.controller';
import { TenantsModule } from './modules/tenants/tenants.module';

@Module({
  imports: [TenantsModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
