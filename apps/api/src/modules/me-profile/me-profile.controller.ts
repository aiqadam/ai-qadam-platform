import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import {
  MEMBER_CONSENT_PURPOSES,
  MeProfileService,
  type MemberConsentPurpose,
  type MemberConsentSummary,
  type MemberProfile,
  type MemberSkill,
  SENIORITY_KEYS,
  type SeniorityKey,
} from './me-profile.service';

// F-S3.6 — REST surface for the /me/profile cabinet (ADR-0033 cabinet #5).
//
// GET    /v1/me/profile               → { profile, consents, skills }
// PATCH  /v1/me/profile               → update core profile fields
// PATCH  /v1/me/profile/consents      → toggle one purpose
// POST   /v1/me/profile/skills        → add a skill tag
// DELETE /v1/me/profile/skills/:id    → remove a skill row
//
// Auth: standard AuthGuard. Members can only touch their own row;
// requireUserId() pulls the sub claim and every service method scopes
// by it.

const profilePatchSchema = z
  .object({
    job_title: z.string().trim().max(160).nullable().optional(),
    seniority: z
      .enum([...SENIORITY_KEYS] as [SeniorityKey, ...SeniorityKey[]])
      .nullable()
      .optional(),
    industry_tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    is_student: z.boolean().optional(),
    bio_md: z.string().max(8000).nullable().optional(),
    appear_in_directory: z.boolean().optional(),
  })
  .strict();

const consentPatchSchema = z
  .object({
    purpose: z.enum([...MEMBER_CONSENT_PURPOSES] as [
      MemberConsentPurpose,
      ...MemberConsentPurpose[],
    ]),
    granted: z.boolean(),
  })
  .strict();

const skillAddSchema = z
  .object({
    // Skill tags: lowercase, hyphen-separated. The Directus schema
    // doesn't enforce this — the controller normalises so the
    // dedupe in the service matches consistently.
    skill_tag: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .transform((s) =>
        s
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, ''),
      ),
  })
  .strict();

@Controller('v1/me/profile')
@UseGuards(AuthGuard)
export class MeProfileController {
  constructor(private readonly profile: MeProfileService) {}

  @Get()
  async getAll(@Req() req: Request): Promise<{
    profile: MemberProfile;
    consents: MemberConsentSummary[];
    skills: MemberSkill[];
  }> {
    const userId = requireUserId(req);
    const [profile, consents, skills] = await Promise.all([
      this.profile.getProfile(userId),
      this.profile.listConsents(userId),
      this.profile.listSkills(userId),
    ]);
    return { profile, consents, skills };
  }

  @Patch()
  async patchProfile(
    @Req() req: Request,
    @Body() body: unknown,
  ): Promise<{ profile: MemberProfile }> {
    const userId = requireUserId(req);
    const parsed = profilePatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const profile = await this.profile.patchProfile(userId, parsed.data);
    return { profile };
  }

  @Patch('consents')
  async setConsent(
    @Req() req: Request,
    @Body() body: unknown,
  ): Promise<{ consent: MemberConsentSummary }> {
    const userId = requireUserId(req);
    const parsed = consentPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const consent = await this.profile.setConsent(userId, parsed.data.purpose, parsed.data.granted);
    return { consent };
  }

  @Post('skills')
  async addSkill(@Req() req: Request, @Body() body: unknown): Promise<{ skill: MemberSkill }> {
    const userId = requireUserId(req);
    const parsed = skillAddSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    if (!parsed.data.skill_tag) {
      throw new BadRequestException('skill_tag normalised to empty string');
    }
    const skill = await this.profile.addSkill(userId, parsed.data.skill_tag);
    return { skill };
  }

  @Delete('skills/:id')
  async removeSkill(@Req() req: Request, @Param('id') id: string): Promise<{ ok: true }> {
    const userId = requireUserId(req);
    await this.profile.removeSkill(userId, id);
    return { ok: true };
  }
}

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new UnauthorizedException('no claims attached');
  }
  return req.user.sub;
}
