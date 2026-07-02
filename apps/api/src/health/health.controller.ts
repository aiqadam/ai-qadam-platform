import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { EmailService } from '../modules/email/email.service';

interface HealthResponse {
  status: 'ok';
  timestamp: string;
  service: 'api';
  tenant: { code: string; name: string } | null;
}

interface EmailHealthResponse {
  configured: boolean;
  provider: 'resend' | 'smtp' | 'none';
  mode: 'production' | 'uat' | 'disabled';
}

@Controller('health')
export class HealthController {
  constructor(private readonly emailService: EmailService) {}

  @Get()
  check(@Req() req: Request): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'api',
      tenant: req.tenant ? { code: req.tenant.code, name: req.tenant.name } : null,
    };
  }

  @Get('email')
  // Unauthenticated platform probe — exposes transport-mode info (provider
  // and the production | uat | disabled tri-state) by design, on the same
  // disclosure surface as GET /health. Do not move this endpoint behind
  // auth without first reviewing that disclosure contract.
  emailHealth(): EmailHealthResponse {
    const provider = this.emailService.getProvider();
    return {
      configured: provider !== 'none',
      provider,
      mode: this.emailService.getMode(),
    };
  }
}
