import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { PostEventCronService, type PostEventTickResult } from './post-event-cron.service';

// F-S1.1c — post-event cron entry. Same external-scheduler pattern as
// F-S1.4 reminders + F-S1.5 matches.

@Controller('v1/internal/post-event')
@UseGuards(InternalAuthGuard)
export class PostEventCronController {
  constructor(private readonly cron: PostEventCronService) {}

  @Post('tick')
  @HttpCode(HttpStatus.OK)
  async tick(): Promise<PostEventTickResult> {
    return this.cron.tick();
  }
}
