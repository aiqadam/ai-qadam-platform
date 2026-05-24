import { Injectable, Logger } from '@nestjs/common';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import { DirectusClient, DirectusError } from '../directus/directus.client';

// F-WebU12 — proxy writes for per-event Q&A. The customer page reads
// directly from Directus via the Public policy (no API hop); only
// writes go through here so we can authenticate the member, resolve
// the local user.id → directus_users.id bridge, and enforce length
// limits in one place.

export class QuestionInvalidError extends Error {
  constructor(reason: string) {
    super(`question invalid: ${reason}`);
    this.name = 'QuestionInvalidError';
  }
}

export class QuestionEventNotFoundError extends Error {
  constructor(public readonly eventId: string) {
    super(`event ${eventId} not found or not published`);
    this.name = 'QuestionEventNotFoundError';
  }
}

export interface CreateQuestionInput {
  eventId: string;
  userId: string; // local users.id from JWT.sub
  questionText: string;
  parentQuestionId?: string;
}

export interface CreatedQuestion {
  id: string;
  eventId: string;
  parentQuestionId: string | null;
  questionText: string;
  createdAt: string;
}

const MAX_QUESTION_LENGTH = 2000;
const MIN_QUESTION_LENGTH = 1;

interface DirectusCreatedRow {
  id: string;
  event: string;
  parent_question: string | null;
  question_text: string;
  date_created: string;
}

@Injectable()
export class EventQuestionsService {
  private readonly logger = new Logger(EventQuestionsService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly bridge: DirectusUsersBridgeService,
  ) {}

  async create(input: CreateQuestionInput): Promise<CreatedQuestion> {
    const text = input.questionText.trim();
    if (text.length < MIN_QUESTION_LENGTH) {
      throw new QuestionInvalidError('text must not be empty');
    }
    if (text.length > MAX_QUESTION_LENGTH) {
      throw new QuestionInvalidError(`text exceeds ${MAX_QUESTION_LENGTH} characters`);
    }

    const eventCheck = await this.directus.get<{ data: { id: string; status: string } | null }>(
      `/items/events/${encodeURIComponent(input.eventId)}?fields=id,status`,
    );
    if (!eventCheck.data || eventCheck.data.status !== 'published') {
      throw new QuestionEventNotFoundError(input.eventId);
    }

    const directusUserId = await this.bridge.resolveDirectusId(input.userId);
    if (!directusUserId) {
      throw new QuestionInvalidError('author identity could not be resolved');
    }

    const body = {
      event: input.eventId,
      user: directusUserId,
      question_text: text,
      parent_question: input.parentQuestionId ?? null,
      status: 'published',
    };

    try {
      const res = await this.directus.post<{ data: DirectusCreatedRow }>(
        '/items/event_questions',
        body,
      );
      return {
        id: res.data.id,
        eventId: res.data.event,
        parentQuestionId: res.data.parent_question,
        questionText: res.data.question_text,
        createdAt: res.data.date_created,
      };
    } catch (err) {
      if (err instanceof DirectusError) {
        this.logger.warn(
          `directus create event_question failed (status=${err.status}, eventId=${input.eventId})`,
        );
      }
      throw err;
    }
  }
}
