import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { TenantMiddleware } from './tenant.middleware';
import { TenantsService } from './tenants.service';

@Module({
  providers: [TenantsService, TenantMiddleware],
  exports: [TenantsService],
})
export class TenantsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Apply tenant middleware to every route. If we add public-static
    // routes later (e.g. /metrics for Prometheus) we exclude them here.
    consumer.apply(TenantMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
