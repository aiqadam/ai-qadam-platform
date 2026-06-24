import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { z } from 'zod';
import {
  CheckinIneligibleError,
  CheckinNotFoundError,
  RegistrationsDirectusService,
  WrongEventError,
} from './registrations-directus.service';

// Zod schema for request validation — validated at the controller boundary.
const CheckinRequestSchema = z.object({
  eventId: z.string().uuid('eventId must be a valid UUID'),
});

type CheckinRequestBody = z.infer<typeof CheckinRequestSchema>;

interface CheckinResponse {
  status: 'ok';
  alreadyCheckedIn: boolean;
  checkedInAt: string;
  member: {
    name: string;
    avatar: string | null;
  };
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    location: string | null;
  };
}

// FR-MIG-021: event-day QR check-in via registration token + event validation.
// Open by design — physical possession of the QR is the auth.
// Returns member info (name + avatar) on success for display on the operator UI.

@Controller('v1/registrations')
export class RegistrationCheckinController {
  constructor(private readonly registrations: RegistrationsDirectusService) {}

  @Post(':token/checkin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async checkin(@Param('token') token: string, @Body() body: unknown): Promise<CheckinResponse> {
    const parsed = CheckinRequestSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join('; ');
      throw new BadRequestException(`Invalid request: ${issues}`);
    }

    const { eventId } = parsed.data as CheckinRequestBody;

    try {
      const result = await this.registrations.checkinWithEvent(token, eventId);
      return {
        status: 'ok',
        alreadyCheckedIn: result.alreadyCheckedIn,
        checkedInAt: result.registration.checkedInAt ?? new Date().toISOString(),
        member: result.member,
        event: result.event,
      };
    } catch (err) {
      if (err instanceof CheckinNotFoundError) {
        throw new NotFoundException('check-in code not recognized');
      }
      if (err instanceof WrongEventError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof CheckinIneligibleError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
