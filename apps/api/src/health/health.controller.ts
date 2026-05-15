import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';

interface HealthResponse {
  status: 'ok';
  timestamp: string;
  service: 'api';
  tenant: { code: string; name: string } | null;
}

@Controller('health')
export class HealthController {
  @Get()
  check(@Req() req: Request): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'api',
      tenant: req.tenant ? { code: req.tenant.code, name: req.tenant.name } : null,
    };
  }
}
