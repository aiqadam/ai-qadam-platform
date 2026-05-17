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
  RegistrationsDirectusService,
} from './registrations-directus.service';

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

// Open by design — the unguessable UUID + physical possession of the QR
// is the auth. Sprint 4.5/2: routes to Directus; the points-on-checkin
// flow auto-creates the ledger row.
@Controller('v1/checkin')
export class CheckinController {
  constructor(private readonly registrations: RegistrationsDirectusService) {}

  @Post(':code')
  @HttpCode(HttpStatus.OK)
  async checkin(@Param('code', new ParseUUIDPipe()) code: string): Promise<CheckinResponse> {
    try {
      const result = await this.registrations.checkin(code);
      return {
        status: 'ok',
        alreadyCheckedIn: result.alreadyCheckedIn,
        checkedInAt: result.registration.checkedInAt ?? new Date().toISOString(),
        event: result.event,
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
