import { Controller, Get, NotFoundException, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from './users.service';

interface PublicProfileResponse {
  handle: string;
  displayName: string | null;
  attendedCount: number;
  registeredCount: number;
  totalPoints: number;
}

// Public profile endpoint backing the /u/[handle] page. Tenant-scoped:
// the counts + points reflect activity in the requesting country only.
// Email is intentionally NOT in the response — handles are the public
// identifier per ADR-0016-style minimal exposure.
@Controller('v1/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':handle/profile')
  async profile(
    @Param('handle') handle: string,
    @Req() req: Request,
  ): Promise<PublicProfileResponse> {
    const tenant = req.tenant;
    if (!tenant) {
      throw new NotFoundException('tenant not resolved');
    }
    const profile = await this.users.getPublicProfile(handle, tenant.code);
    if (!profile) {
      throw new NotFoundException(`no profile for handle '${handle}'`);
    }
    return {
      handle: profile.user.handle ?? handle,
      displayName: profile.user.displayName,
      attendedCount: profile.attendedCount,
      registeredCount: profile.registeredCount,
      totalPoints: profile.totalPoints,
    };
  }
}
