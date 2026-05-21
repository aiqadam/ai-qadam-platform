import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InteractionsService } from '../interactions/interactions.service';
import type { DispatchResult } from '../interactions/interactions.types';
import { CohortsService } from './cohorts.service';
import { MembersService } from './members.service';

// F-S3.3 — operator-authored announcements.
//
// Flow: operator picks a saved cohort → composes subject + body →
// previews → sends. We resolve the cohort's filter to user IDs and
// hand off to the existing InteractionsService.dispatch, which:
//   - creates the interaction + delivery rows
//   - runs per-recipient consent checks (skipped if consent_basis
//     mismatches the recipient's preferences)
//   - calls the email adapter with the raw {subject,text,html} payload
//   - patches delivery states from the adapter result
//
// Composition is operator-typed plain text with blank-line paragraph
// breaks. Rich markdown deferred to v1.1 — keeps escape rules trivial
// + matches the dispatcher's existing raw-payload contract.

interface ComposeInput {
  cohortId: string;
  subject: string;
  body: string;
  // 'explicit_opt_in' = marketing-class send; consent records gate per
  // recipient. 'operational_contract' = transactional (must NOT be
  // used for marketing). Operators pick at compose time; UI defaults
  // to explicit_opt_in to avoid accidental over-broad sends.
  consentBasis: 'explicit_opt_in' | 'operational_contract';
}

export interface AnnouncePreview {
  cohortName: string;
  estimatedRecipients: number;
  truncated: boolean;
  subject: string;
  text: string;
}

export interface AnnounceSent {
  interactionId: string;
  recipientCount: number;
  truncated: boolean;
  deliveriesSummary: {
    sent: number;
    skipped_consent: number;
    failed: number;
    other: number;
  };
}

// Plain-text + minimally-HTML rendering for the operator's typed body.
// Mirrors the operator-announcement template I considered as a separate
// file — kept here because the dispatcher's raw-payload contract already
// handles this; no new adapter template needed.

const ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE[c] ?? c);
}
function bodyToHtml(body: string, unsubscribeUrl: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('\n  ');
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  ${paragraphs}
  <p style="margin-top: 32px; color: #6b7280; font-size: 13px;">— AI Qadam</p>
  <p style="margin-top: 24px; color: #9ca3af; font-size: 12px;">
    <a href="${escapeHtml(unsubscribeUrl)}" style="color: #9ca3af;">Manage email preferences</a>
  </p>
</body></html>`;
}
function bodyToText(body: string, unsubscribeUrl: string): string {
  return `${body.replace(/[ \t]+$/gm, '').trim()}\n\n— AI Qadam\n\nManage your email preferences: ${unsubscribeUrl}`;
}

type DeliverySummary = { sent: number; skipped_consent: number; failed: number; other: number };

function summarizeDeliveries(deliveries: DispatchResult['deliveries']): DeliverySummary {
  const summary: DeliverySummary = { sent: 0, skipped_consent: 0, failed: 0, other: 0 };
  for (const d of deliveries) {
    if (d.state === 'sent') summary.sent++;
    else if (d.state === 'skipped_consent') summary.skipped_consent++;
    else if (d.state === 'failed') summary.failed++;
    else summary.other++;
  }
  return summary;
}

@Injectable()
export class AnnounceService {
  private readonly logger = new Logger(AnnounceService.name);

  constructor(
    private readonly cohorts: CohortsService,
    private readonly members: MembersService,
    private readonly interactions: InteractionsService,
  ) {}

  async preview(cohortId: string, subject: string, body: string): Promise<AnnouncePreview> {
    if (!cohortId) throw new BadRequestException('cohortId required');
    if (!subject?.trim()) throw new BadRequestException('subject required');
    if (!body?.trim()) throw new BadRequestException('body required');
    const cohort = await this.cohorts.getById(cohortId);
    if (!cohort) throw new NotFoundException(`cohort ${cohortId} not found`);
    return {
      cohortName: cohort.name,
      estimatedRecipients: cohort.current_member_count,
      truncated: cohort.current_member_count > MembersService.MAX_DISPATCH_AUDIENCE,
      subject,
      // Show preview with placeholder web base URL since we don't have
      // the recipient context yet; real send substitutes per-recipient
      // greeting via the dispatcher.
      text: bodyToText(body, 'https://aiqadam.org/me/preferences'),
    };
  }

  async send(input: ComposeInput, createdByUserId: string): Promise<AnnounceSent> {
    if (!input.cohortId) throw new BadRequestException('cohortId required');
    if (!input.subject?.trim()) throw new BadRequestException('subject required');
    if (!input.body?.trim()) throw new BadRequestException('body required');

    const cohort = await this.cohorts.getById(input.cohortId);
    if (!cohort) throw new NotFoundException(`cohort ${input.cohortId} not found`);

    const resolved = await this.members.resolveToUserIds(cohort.filter_query);
    if (resolved.userIds.length === 0) {
      throw new BadRequestException(
        `cohort ${cohort.name} currently has 0 members; refine the filter or wait`,
      );
    }

    const unsubscribeUrl = 'https://aiqadam.org/me/preferences';
    const payload = {
      subject: input.subject.trim(),
      text: bodyToText(input.body, unsubscribeUrl),
      html: bodyToHtml(input.body, unsubscribeUrl),
    };

    const result: DispatchResult = await this.interactions.dispatch({
      initiatorActor: 'operator',
      initiatorId: createdByUserId,
      audience: { userIds: resolved.userIds },
      intent: 'operator_announcement',
      payload,
      consentBasis: input.consentBasis,
      allowedChannels: ['email'],
      createdBy: createdByUserId,
    });

    const summary = summarizeDeliveries(result.deliveries);

    this.logger.log(
      `operator_announcement intent dispatched cohort=${cohort.slug} recipients=${resolved.userIds.length} sent=${summary.sent}`,
    );

    return {
      interactionId: result.interactionId,
      recipientCount: resolved.userIds.length,
      truncated: resolved.truncated,
      deliveriesSummary: summary,
    };
  }
}
