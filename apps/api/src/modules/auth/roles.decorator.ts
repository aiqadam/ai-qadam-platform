import { type CustomDecorator, SetMetadata } from '@nestjs/common';

// Role gate metadata consumed by AdminGuard. Use as:
//   @UseGuards(AuthGuard, AdminGuard)
//   @Roles('country_admin', 'super_admin')
//   @Post('events') ...

export type Role = 'member' | 'organizer' | 'country_admin' | 'super_admin';

export const ROLES_KEY = 'aiqadam:roles';

export const Roles = (...roles: Role[]): CustomDecorator<string> => SetMetadata(ROLES_KEY, roles);
