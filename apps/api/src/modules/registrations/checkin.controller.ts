import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  CheckinIneligibleError,
  CheckinNotFoundError,
  RegistrationsService,
} from './registrations.service';

interface CheckinResponse {
  status: 'ok';
  alreadyCheckedIn: boolean;
  checkedInAt: string;
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    location: string | null;
  };
}

// Open by design — see PR #16 trust model. The unguessable UUID + physical
// possession of the QR is the auth. Hardening to organizer-only check-in is
// a follow-up after the org-membership feature lands.
@Controller('v1/checkin')
export class CheckinController {
  constructor(private readonly registrations: RegistrationsService) {}

  @Post(':code')
  @HttpCode(HttpStatus.OK)
  async checkin(@Param('code', new ParseUUIDPipe()) code: string): Promise<CheckinResponse> {
    try {
      const result = await this.registrations.checkin(code);
      const checkedInAt = result.registration.checkedInAt ?? new Date();
      return {
        status: 'ok',
        alreadyCheckedIn: result.alreadyCheckedIn,
        checkedInAt: checkedInAt.toISOString(),
        event: {
          id: result.event.id,
          title: result.event.title,
          startsAt: result.event.startsAt.toISOString(),
          endsAt: result.event.endsAt.toISOString(),
          location: result.event.location,
        },
      };
    } catch (err) {
      if (err instanceof CheckinNotFoundError) {
        throw new NotFoundException('check-in code not recognized');
      }
      if (err instanceof CheckinIneligibleError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
