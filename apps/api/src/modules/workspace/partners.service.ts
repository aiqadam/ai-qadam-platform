import { Injectable, NotFoundException } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';

// F-S3.5 (ADR-0033 Part 3 — cabinet #4). Read-only sponsor cabinet.
// Hard PII boundary: this service returns aggregate metadata only.
// Member-level cohort contents NEVER cross this surface — sponsors
// get { cohort_name, member_count } and nothing else.
//
// Full cohort analytics (Metabase queries against bi.* views) is the
// Phase-4 follow-up. v1 ships the entitlement structure + kit
// downloads so the cabinet is useful immediately.

export interface PartnerSummary {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  industry: string | null;
  website: string | null;
  is_sponsor: boolean;
  is_employer: boolean;
  is_product_partner: boolean;
  status: 'active' | 'pending' | 'archived';
}

export interface PartnerAudienceSummary {
  id: string;
  cohort_id: string;
  cohort_name: string;
  member_count: number;
  purpose: string;
  granted_at: string;
  expires_at: string | null;
}

export interface KitAsset {
  id: string;
  category: string;
  title: string;
  file_url: string | null;
  // F-S3.5-b — true when marketing_assets.sponsor = this partner.id
  // (exclusive co-marketing piece); false when the asset is part of
  // the shared sponsor pool (sponsor IS NULL).
  is_partner_exclusive: boolean;
  // Categories defined in ADR-0025 / F-S0.9b marketing_assets schema.
}

export interface PartnerDetail extends PartnerSummary {
  audiences: PartnerAudienceSummary[];
  kit_assets: KitAsset[];
}

@Injectable()
export class PartnersService {
  constructor(private readonly directus: DirectusClient) {}

  // List active sponsors. Includes employers + product partners — the
  // cabinet filters server-side via the is_* flags so the same surface
  // serves all three roles (a future PR can split if UX diverges).
  async listSponsors(): Promise<PartnerSummary[]> {
    const filter = encodeURIComponent(
      JSON.stringify({
        status: { _eq: 'active' },
        _or: [
          { is_sponsor: { _eq: true } },
          { is_employer: { _eq: true } },
          { is_product_partner: { _eq: true } },
        ],
      }),
    );
    const fields =
      'id,name,slug,country,industry,website,is_sponsor,is_employer,is_product_partner,status';
    const res = await this.directus.get<{ data: PartnerSummary[] }>(
      `/items/companies?filter=${filter}&fields=${fields}&sort=name&limit=200`,
    );
    return res.data;
  }

  async getPartner(slug: string): Promise<PartnerDetail> {
    const filter = encodeURIComponent(JSON.stringify({ slug: { _eq: slug } }));
    const fields =
      'id,name,slug,country,industry,website,is_sponsor,is_employer,is_product_partner,status';
    const compRes = await this.directus.get<{ data: PartnerSummary[] }>(
      `/items/companies?filter=${filter}&fields=${fields}&limit=1`,
    );
    const partner = compRes.data[0];
    if (!partner) throw new NotFoundException('partner_not_found');

    // Entitlements — joins cohorts.name + member_count_cached. The
    // PII boundary lives at the API boundary: we never SELECT cohort
    // members here, only the cached count.
    type AudienceRaw = {
      id: string;
      cohort: { id?: string; name?: string; member_count_cached?: number } | string | null;
      purpose: string;
      granted_at: string;
      expires_at: string | null;
    };
    const audFilter = encodeURIComponent(JSON.stringify({ partner: { _eq: partner.id } }));
    const audRes = await this.directus.get<{ data: AudienceRaw[] }>(
      `/items/partner_audiences?filter=${audFilter}&fields=id,cohort.id,cohort.name,cohort.member_count_cached,purpose,granted_at,expires_at&sort=-granted_at&limit=100`,
    );
    const audiences = audRes.data.map((row): PartnerAudienceSummary => {
      const c = row.cohort;
      const cohort_id = typeof c === 'string' ? c : (c?.id ?? '');
      const cohort_name =
        typeof c === 'object' && c !== null ? (c.name ?? '(deleted)') : '(missing)';
      const member_count = typeof c === 'object' && c !== null ? (c.member_count_cached ?? 0) : 0;
      return {
        id: row.id,
        cohort_id,
        cohort_name,
        member_count,
        purpose: row.purpose,
        granted_at: row.granted_at,
        expires_at: row.expires_at,
      };
    });

    const kit_assets = await this.fetchKitAssets(partner.id);
    return { ...partner, audiences, kit_assets };
  }

  // F-S3.5-b kit-assets scoping. Two tiers:
  //   1. Partner-exclusive: marketing_assets.sponsor = partner.id
  //      (co-marketing pieces commissioned for this sponsor).
  //   2. Shared sponsor pool: sponsor IS NULL + visibility IN
  //      (public, sponsors). Brand pack, fact sheet, generic headshots
  //      — anything ops produced for any sponsor.
  // Other partners' exclusive assets are explicitly excluded.
  private async fetchKitAssets(partnerId: string): Promise<KitAsset[]> {
    type AssetRaw = {
      id: string;
      category: string;
      title: string;
      file: { id?: string } | string | null;
      sponsor: string | null;
    };
    const kitFilter = encodeURIComponent(
      JSON.stringify({
        status: { _eq: 'approved' },
        _or: [
          { sponsor: { _eq: partnerId } },
          {
            _and: [{ sponsor: { _null: true } }, { visibility: { _in: ['public', 'sponsors'] } }],
          },
        ],
      }),
    );
    const kitRes = await this.directus.get<{ data: AssetRaw[] }>(
      `/items/marketing_assets?filter=${kitFilter}&fields=id,category,title,file.id,sponsor&sort=-date_created&limit=50`,
    );
    return kitRes.data.map((a): KitAsset => {
      const fileId =
        typeof a.file === 'string'
          ? a.file
          : typeof a.file === 'object'
            ? (a.file?.id ?? null)
            : null;
      return {
        id: a.id,
        category: a.category,
        title: a.title,
        file_url: fileId ? `/api/assets/${fileId}` : null,
        is_partner_exclusive: a.sponsor === partnerId,
      };
    });
  }
}
