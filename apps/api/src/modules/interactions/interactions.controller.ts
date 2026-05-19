import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { InteractionsService } from './interactions.service';
import { type DispatchResult, dispatchInputSchema } from './interactions.types';

// Sprint 5.5/4 — internal HTTP entry point. Directus flows (5.5/5+) and
// service-to-service callers POST here with the same JSON shape as
// DispatchInput. We re-validate at the boundary; the service trusts its
// inputs.

@Controller('v1/internal/interactions')
@UseGuards(InternalAuthGuard)
export class InteractionsController {
  constructor(private readonly interactions: InteractionsService) {}

  @Post('dispatch')
  @HttpCode(HttpStatus.ACCEPTED)
  async dispatch(@Body() body: unknown): Promise<DispatchResult> {
    const parsed = dispatchInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.interactions.dispatch(parsed.data);
  }
}
