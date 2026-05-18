import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { InternalAuthGuard } from './internal-auth.guard';
import { TwentyClient } from './twenty.client';

// Sprint 5 C5.3 — Directus flow on directus_users.items.create/update calls
// this endpoint, which upserts a Twenty Person row keyed by email.
//
// Idempotency: lookup by primaryEmail. If found → PATCH the updatable
// fields; if absent → POST a new Person. Returns the Twenty person id
// so callers (CRM activity sync in C5.4) can attach activities.

const syncContactSchema = z.object({
  directusUserId: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  country: z.string().length(2).optional(),
});

type SyncContactResponse = {
  personId: string;
  action: 'created' | 'updated' | 'unchanged';
};

// Activity kinds we record in Twenty's timeline. Each maps to a Note
// title prefix; the body carries event details.
const ACTIVITY_KINDS = ['registered', 'waitlisted', 'cancelled', 'attended', 'promoted'] as const;
type ActivityKind = (typeof ACTIVITY_KINDS)[number];

const logActivitySchema = z.object({
  email: z.string().email(),
  kind: z.enum(ACTIVITY_KINDS),
  eventTitle: z.string().min(1),
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime().optional(),
});

type LogActivityResponse = {
  noteId: string;
  noteTargetId: string;
  action: 'created' | 'skipped';
  reason?: string;
};

interface TwentyPerson {
  id: string;
  name: { firstName: string; lastName: string };
  emails: { primaryEmail: string };
  city?: string;
}

@Controller('v1/internal/crm')
@UseGuards(InternalAuthGuard)
export class CrmController {
  constructor(private readonly twenty: TwentyClient) {}

  @Post('sync-contact')
  @HttpCode(HttpStatus.ACCEPTED)
  async syncContact(@Body() body: unknown): Promise<SyncContactResponse> {
    const parsed = syncContactSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const { email, firstName, lastName, country } = parsed.data;

    const existing = await this.findPersonByEmail(email);

    const payload = buildPersonPayload({ email, firstName, lastName, country });

    if (existing) {
      const changed = needsUpdate(existing, payload);
      if (!changed) {
        return { personId: existing.id, action: 'unchanged' };
      }
      const res = await this.twenty.patch<{ data: { updatePerson: TwentyPerson } }>(
        `/rest/people/${existing.id}`,
        payload,
      );
      return { personId: res.data.updatePerson.id, action: 'updated' };
    }

    const res = await this.twenty.post<{ data: { createPerson: TwentyPerson } }>(
      '/rest/people',
      payload,
    );
    return { personId: res.data.createPerson.id, action: 'created' };
  }

  private async findPersonByEmail(email: string): Promise<TwentyPerson | undefined> {
    // Twenty REST filter syntax: filter=emails.primaryEmail[eq]:<value>
    const filter = `emails.primaryEmail[eq]:${email}`;
    const res = await this.twenty.get<{
      data: { people: TwentyPerson[] };
    }>(`/rest/people?filter=${encodeURIComponent(filter)}&limit=1`);
    return res.data.people[0];
  }

  // Sprint 5 C5.4 — Directus flows on registrations.items.create/update
  // call this endpoint to append a Note to the matching Twenty Person.
  // Skipped (not 4xx) if the Person doesn't exist yet — happens when a
  // registration fires before C5.3's sync flow has caught up, or for
  // legacy data. Caller sees action='skipped' + reason.
  @Post('log-activity')
  @HttpCode(HttpStatus.ACCEPTED)
  async logActivity(@Body() body: unknown): Promise<LogActivityResponse> {
    const parsed = logActivitySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const { email, kind, eventTitle, eventId, occurredAt } = parsed.data;

    const person = await this.findPersonByEmail(email);
    if (!person) {
      return {
        noteId: '',
        noteTargetId: '',
        action: 'skipped',
        reason: `no Twenty Person for ${email}`,
      };
    }

    const note = buildActivityNote({ kind, eventTitle, eventId, occurredAt });
    const noteRes = await this.twenty.post<{ data: { createNote: { id: string } } }>(
      '/rest/notes',
      note,
    );
    const noteId = noteRes.data.createNote.id;
    const targetRes = await this.twenty.post<{ data: { createNoteTarget: { id: string } } }>(
      '/rest/noteTargets',
      { noteId, personId: person.id },
    );
    return {
      noteId,
      noteTargetId: targetRes.data.createNoteTarget.id,
      action: 'created',
    };
  }
}

const KIND_TITLE: Record<ActivityKind, string> = {
  registered: 'Registered for',
  waitlisted: 'Waitlisted for',
  cancelled: 'Cancelled',
  attended: 'Attended',
  promoted: 'Promoted off waitlist:',
};

function buildActivityNote(input: {
  kind: ActivityKind;
  eventTitle: string;
  eventId: string;
  occurredAt?: string | undefined;
}): { title: string; body: string } {
  const title = `${KIND_TITLE[input.kind]} ${input.eventTitle}`.trim();
  const when = input.occurredAt ?? new Date().toISOString();
  const body = `Event: ${input.eventTitle}\nEvent ID: ${input.eventId}\nOccurred: ${when}`;
  return { title, body };
}

function buildPersonPayload(input: {
  email: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
  country?: string | undefined;
}): Record<string, unknown> {
  return {
    emails: { primaryEmail: input.email },
    name: {
      firstName: input.firstName ?? '',
      lastName: input.lastName ?? '',
    },
    ...(input.country ? { city: input.country.toUpperCase() } : {}),
  };
}

function needsUpdate(existing: TwentyPerson, next: Record<string, unknown>): boolean {
  const nextName = (next.name as { firstName: string; lastName: string }) ?? {
    firstName: '',
    lastName: '',
  };
  if (existing.name.firstName !== nextName.firstName) return true;
  if (existing.name.lastName !== nextName.lastName) return true;
  const nextCity = (next.city as string | undefined) ?? '';
  if ((existing.city ?? '') !== nextCity) return true;
  return false;
}
