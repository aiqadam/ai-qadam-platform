import { Controller, Get, NotFoundException, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminService } from './admin.service';

interface DashboardResponse {
  tenant: string;
  stats: {
    upcomingEvents: number;
    registrationsThisWeek: number;
    pointsThisWeek: number;
  };
  topMembers: Array<{
    userId: string;
    displayName: string | null;
    email: string;
    totalPoints: number;
  }>;
}

// All /v1/admin/* routes require an authenticated user with country_admin
// or super_admin role. Tenant comes from the usual TenantMiddleware path.

@Controller('v1/admin')
@UseGuards(AuthGuard, AdminGuard)
@Roles('country_admin', 'super_admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  async dashboard(@Req() req: Request): Promise<DashboardResponse> {
    const tenant = req.tenant;
    if (!tenant) {
      throw new NotFoundException('tenant not resolved');
    }
    const stats = await this.admin.dashboard(tenant.code);
    return {
      tenant: tenant.code,
      stats: {
        upcomingEvents: stats.upcomingEvents,
        registrationsThisWeek: stats.registrationsThisWeek,
        pointsThisWeek: stats.pointsThisWeek,
      },
      topMembers: stats.topMembers,
    };
  }
}
