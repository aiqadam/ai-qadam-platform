import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { BadgeAwarderService } from './badge-awarder.service';

// C-4b-4 — backfill endpoint. Internal-token auth (same guard the
// Directus flow callbacks use). Idempotent: re-running just reports
// `badgesSkippedExisting` for already-awarded rows.
//
// Trigger once after the deploy carrying this PR lands on prod:
//   curl -X POST https://uz.aiqadam.org/api/v1/internal/badges/backfill \
//     -H "x-internal-auth: $INTERNAL_API_TOKEN"
//
// Output: { usersScanned, badgesAwardedNew, badgesSkippedExisting }.

@Controller('v1/internal/badges')
@UseGuards(InternalAuthGuard)
export class BadgesInternalController {
  constructor(private readonly awarder: BadgeAwarderService) {}

  @Post('backfill')
  @HttpCode(HttpStatus.OK)
  async backfill(): Promise<{
    usersScanned: number;
    badgesAwardedNew: number;
    badgesSkippedExisting: number;
  }> {
    return this.awarder.backfillCountAttended();
  }
}
