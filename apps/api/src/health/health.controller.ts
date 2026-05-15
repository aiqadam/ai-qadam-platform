import { Controller, Get } from '@nestjs/common';

interface HealthResponse {
  status: 'ok';
  timestamp: string;
  service: 'api';
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'api',
    };
  }
}
