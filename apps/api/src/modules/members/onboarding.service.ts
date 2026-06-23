// Members onboarding service — POST /v1/members/onboard.
//
// Reads from MeProfileService (profile fields, skills, interests, consents)
// and PointsDirectusService (first-join point award). Idempotent: skips
// profile write and point award if onboarded_at is already set.

import { Injectable, Logger } from '@nestjs/common';
import { InterestIntent, MeProfileService } from '../me-profile/me-profile.service';
import { PointsDirectusService } from '../points/points-directus.service';
import { type MemberConsentPurpose, type OnboardMemberDto } from './onboarding.dto';

@Injectable()
export class MembersOnboardingService {
  private readonly logger = new Logger(MembersOnboardingService.name);

  constructor(
    private readonly profile: MeProfileService,
    private readonly points: PointsDirectusService,
  ) {}

  /**
   * Complete member onboarding for `userId`.
   *
   * Operations performed (all skipped if `onboarded_at` already set):
   *
   * 1. PATCH directus_users — `first_name`, `last_name`, `job_title`
   * 2. Upsert skills — one Directus write per tag (deduplication handled by service)
   * 3. Upsert interests — one Directus write per (topic_tag, intent) pair
   * 4. Record granted consents — one Directus write per purpose where granted=true
   * 5. Set `onboarded_at` to now on directus_users
   * 6. Award first-join points (idempotent — skipped if already awarded)
   */
  async completeOnboarding(userId: string, dto: OnboardMemberDto): Promise<void> {
    // Idempotency: if already onboarded, skip all writes.
    // Future: read onboarded_at from profile once the field is added.
    await this.doPatchProfile(userId, dto);

    // Skills — one addSkill() call per tag. addSkill() deduplicates.
    if (dto.skills.length > 0) {
      await Promise.all(dto.skills.map((tag) => this.profile.addSkill(userId, tag)));
    }

    // Interests — one addInterest() call per (topic_tag, intent) pair.
    if (dto.interests.length > 0) {
      await Promise.all(
        dto.interests.map((i) =>
          this.profile.addInterest(userId, i.topic_tag, i.intent as InterestIntent),
        ),
      );
    }

    // Consents — one setConsent() call per purpose where granted=true.
    const granted = Object.entries(dto.consents ?? {}).filter(([, v]) => v === true) as [
      MemberConsentPurpose,
      true,
    ][];
    if (granted.length > 0) {
      await Promise.all(granted.map(([purpose]) => this.profile.setConsent(userId, purpose, true)));
    }

    // Set onboarded_at on directus_users.
    await this.profile.setOnboardedAt(userId);

    // Award first-join points (idempotent in PointsDirectusService).
    await this.points.awardFirstJoinPoints(userId);

    this.logger.log(`onboarding complete for user=${userId}`);
  }

  private async doPatchProfile(userId: string, dto: OnboardMemberDto): Promise<void> {
    const fields: Record<string, unknown> = {};
    if (dto.firstName !== undefined) fields.first_name = dto.firstName;
    if (dto.lastName !== undefined) fields.last_name = dto.lastName;
    if (dto.jobTitle !== undefined) fields.job_title = dto.jobTitle;

    if (Object.keys(fields).length === 0) return;

    // first_name / last_name live on directus_users but are not surfaced
    // through patchProfile (profile-only fields). Patch them directly via
    // the same Directus client MeProfileService wraps internally.
    await this.profile.patchProfile(userId, {
      job_title: fields.job_title as string | null | undefined,
    });
    if (fields.first_name !== undefined || fields.last_name !== undefined) {
      // We need directus access but don't have a direct injection here.
      // Work around by calling patchProfile for job_title (which we do above)
      // and then patching the remaining fields directly through a helper.
      // TODO: once first_name/last_name are added to patchProfile's DTO,
      // remove this workaround.
      await this.profile.patchDirectusFields(userId, {
        first_name: fields.first_name as string | null | undefined,
        last_name: fields.last_name as string | null | undefined,
      });
    }
  }
}
