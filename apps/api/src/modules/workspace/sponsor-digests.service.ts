import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import PDFDocument from 'pdfkit';
import { DirectusClient } from '../directus/directus.client';
import { TickLockService } from '../internal-cron/tick-lock.service';

// F-S3.8 — Sponsor quarterly digest cron service.
//
// Once per quarter (5th day of the new quarter, via GHA cron), for each
// sponsor lacking a sponsor_digests row for the just-closed quarter:
//   1. Compute country-level rollups (events, registrations, avg CSAT,
//      speaker count) for the quarter window.
//   2. Read the sponsor's entitled cohorts via partner_audiences and
//      include the cached member counts (NOT the member rows — see
//      ADR-0033 sponsor PII boundary).
//   3. Render a PDF via pdfkit (Alpine-safe pure JS).
//   4. Upload PDF to Directus files; insert sponsor_digests ledger +
//      marketing_assets row so the partner cabinet's kit_assets section
//      (F-S3.5-b) surfaces it automatically.
//
// PII boundary: this service NEVER reads or writes member email/name/
// handle into the PDF. Asserted by a smoke test.

export interface QuarterTag {
  year: number;
  q: 1 | 2 | 3 | 4;
  tag: string; // YYYYQn
  startsAt: string; // ISO
  endsAt: string; // ISO (exclusive)
}

export interface SponsorDigestTickResult {
  quarter: string; // YYYYQn
  evaluated: number;
  generated: Array<{ sponsorId: string; sponsorName: string; assetFileId: string }>;
  skipped: Array<{ sponsorId: string; reason: 'already_generated' | 'no_audiences' }>;
  errors: Array<{ sponsorId: string; message: string }>;
}

interface SponsorRow {
  id: string;
  name: string;
  country: string | null;
}

interface DigestRollup {
  eventCount: number;
  registrationCount: number;
  attendedCount: number;
  avgCsat: number | null;
  speakerCount: number;
}

interface CohortSummary {
  id: string;
  name: string;
  memberCount: number;
  purpose: string;
}

// Generation kicks in 5+ days after the quarter ends so CSAT, attendance,
// and post-event followups have time to settle. Picks the most recently
// closed quarter relative to `now`.
export function priorQuarter(now: Date): QuarterTag {
  // Most-recent-closed quarter = the quarter that ended before `now`.
  // E.g. now=2026-04-05 → returns Q1 2026 (Jan 1 – Mar 31).
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0..11
  const currentQ = Math.floor(m / 3) + 1; // 1..4
  let year = y;
  let q = currentQ - 1;
  if (q === 0) {
    q = 4;
    year = y - 1;
  }
  const startMonth = (q - 1) * 3; // 0,3,6,9
  const endMonth = startMonth + 3; // 3,6,9,12
  const startsAt = new Date(Date.UTC(year, startMonth, 1)).toISOString();
  // endsAt is exclusive: midnight of the first day of the next quarter.
  const endsAt =
    endMonth === 12
      ? new Date(Date.UTC(year + 1, 0, 1)).toISOString()
      : new Date(Date.UTC(year, endMonth, 1)).toISOString();
  return { year, q: q as 1 | 2 | 3 | 4, tag: `${year}Q${q}`, startsAt, endsAt };
}

@Injectable()
export class SponsorDigestsService {
  private readonly logger = new Logger(SponsorDigestsService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly locks: TickLockService,
  ) {}

  // Monthly cron — 04:00 UTC on the 5th of every month per F-S3.8 spec
  // (replaces the deleted .github/workflows/sponsor-digest-cron.yml).
  // ~09:00 in UZ/KZ. tick() is idempotent across the quarter so the
  // 9 non-quarter-boundary monthly runs are cheap no-ops.
  @Cron('0 4 5 * *')
  async scheduledTick(): Promise<void> {
    await this.locks.withLock('sponsor-digests', 600, async () => {
      const r = await this.tick();
      this.logger.log(`scheduledTick generated=${r.generated.length} skipped=${r.skipped.length}`);
    });
  }

  async tick(now: Date = new Date()): Promise<SponsorDigestTickResult> {
    const quarter = priorQuarter(now);
    const sponsors = await this.activeSponsors();
    const result: SponsorDigestTickResult = {
      quarter: quarter.tag,
      evaluated: sponsors.length,
      generated: [],
      skipped: [],
      errors: [],
    };

    for (const sponsor of sponsors) {
      try {
        const status = await this.maybeGenerate(sponsor, quarter);
        if (status.kind === 'generated') {
          result.generated.push({
            sponsorId: sponsor.id,
            sponsorName: sponsor.name,
            assetFileId: status.assetFileId,
          });
        } else {
          result.skipped.push({ sponsorId: sponsor.id, reason: status.reason });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        result.errors.push({ sponsorId: sponsor.id, message });
        this.logger.warn(`sponsor-digest tick error sponsor=${sponsor.id}: ${message}`);
      }
    }

    this.logger.log(
      `sponsor-digest tick — quarter=${quarter.tag} evaluated=${result.evaluated} generated=${result.generated.length} skipped=${result.skipped.length} errors=${result.errors.length}`,
    );
    return result;
  }

  // ─── Per-sponsor pipeline ──────────────────────────────────────────────

  private async maybeGenerate(
    sponsor: SponsorRow,
    quarter: QuarterTag,
  ): Promise<
    | { kind: 'generated'; assetFileId: string }
    | { kind: 'skipped'; reason: 'already_generated' | 'no_audiences' }
  > {
    const existing = await this.findExistingDigest(sponsor.id, quarter.tag);
    if (existing) return { kind: 'skipped', reason: 'already_generated' };

    const audiences = await this.fetchAudiences(sponsor.id);
    if (audiences.length === 0) return { kind: 'skipped', reason: 'no_audiences' };

    const rollup = await this.computeRollup(sponsor, quarter);
    const pdf = await this.renderPdf(sponsor, quarter, rollup, audiences);
    const fileId = await this.uploadPdf(sponsor, quarter, pdf);
    await this.recordLedger(sponsor.id, quarter.tag, fileId);
    await this.recordMarketingAsset(sponsor.id, quarter.tag, fileId);
    return { kind: 'generated', assetFileId: fileId };
  }

  // ─── Data layer ───────────────────────────────────────────────────────

  private async activeSponsors(): Promise<SponsorRow[]> {
    const filter = encodeURIComponent(
      JSON.stringify({ status: { _eq: 'active' }, is_sponsor: { _eq: true } }),
    );
    const res = await this.directus.get<{ data: SponsorRow[] }>(
      `/items/companies?filter=${filter}&fields=id,name,country&sort=name&limit=200`,
    );
    return res.data;
  }

  private async findExistingDigest(
    sponsorId: string,
    quarterTag: string,
  ): Promise<{ id: string } | null> {
    const filter = encodeURIComponent(
      JSON.stringify({ sponsor: { _eq: sponsorId }, quarter_tag: { _eq: quarterTag } }),
    );
    const res = await this.directus.get<{ data: Array<{ id: string }> }>(
      `/items/sponsor_digests?filter=${filter}&fields=id&limit=1`,
    );
    return res.data[0] ?? null;
  }

  private async fetchAudiences(sponsorId: string): Promise<CohortSummary[]> {
    type AudienceRaw = {
      id: string;
      cohort: { id?: string; name?: string; member_count_cached?: number } | string | null;
      purpose: string;
    };
    const filter = encodeURIComponent(JSON.stringify({ partner: { _eq: sponsorId } }));
    const res = await this.directus.get<{ data: AudienceRaw[] }>(
      `/items/partner_audiences?filter=${filter}&fields=id,cohort.id,cohort.name,cohort.member_count_cached,purpose&limit=100`,
    );
    return res.data
      .filter((a) => typeof a.cohort === 'object' && a.cohort !== null && a.cohort.id)
      .map((a): CohortSummary => {
        const c = a.cohort as { id: string; name?: string; member_count_cached?: number };
        return {
          id: c.id,
          name: c.name ?? '(unnamed cohort)',
          memberCount: c.member_count_cached ?? 0,
          purpose: a.purpose,
        };
      });
  }

  private async computeRollup(sponsor: SponsorRow, quarter: QuarterTag): Promise<DigestRollup> {
    // Country scope: sponsor's home country. Multi-country sponsors are
    // a future extension; v1 keeps the data scope predictable.
    const country = sponsor.country ?? 'uz';
    const window = `&filter[starts_at][_gte]=${quarter.startsAt}&filter[starts_at][_lt]=${quarter.endsAt}&filter[country][_eq]=${country}`;
    const [eventsAgg, regAgg, attendedAgg, csatAgg, speakerAgg] = await Promise.all([
      this.aggregateCount(`/items/events?aggregate[count]=id${window}`),
      this.aggregateCount(
        `/items/registrations?aggregate[count]=id&filter[event][country][_eq]=${country}&filter[event][starts_at][_gte]=${quarter.startsAt}&filter[event][starts_at][_lt]=${quarter.endsAt}`,
      ),
      this.aggregateCount(
        `/items/registrations?aggregate[count]=id&filter[status][_eq]=attended&filter[event][country][_eq]=${country}&filter[event][starts_at][_gte]=${quarter.startsAt}&filter[event][starts_at][_lt]=${quarter.endsAt}`,
      ),
      this.aggregateAvg(
        `/items/interaction_responses?aggregate[avg]=csat_score&filter[response_intent][_eq]=csat_score&filter[event][country][_eq]=${country}&filter[event][starts_at][_gte]=${quarter.startsAt}&filter[event][starts_at][_lt]=${quarter.endsAt}`,
        'csat_score',
      ),
      this.aggregateCount(
        `/items/event_speakers?aggregate[count]=id&filter[status][_eq]=confirmed&filter[event][country][_eq]=${country}&filter[event][starts_at][_gte]=${quarter.startsAt}&filter[event][starts_at][_lt]=${quarter.endsAt}`,
      ),
    ]);
    return {
      eventCount: eventsAgg,
      registrationCount: regAgg,
      attendedCount: attendedAgg,
      avgCsat: csatAgg,
      speakerCount: speakerAgg,
    };
  }

  private async aggregateCount(path: string): Promise<number> {
    const res = await this.directus.get<{ data: Array<{ count: { id: string | number } }> }>(path);
    const raw = res.data[0]?.count?.id;
    if (raw == null) return 0;
    return typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
  }

  private async aggregateAvg(path: string, field: string): Promise<number | null> {
    const res = await this.directus.get<{
      data: Array<{ avg: Record<string, string | number | null> }>;
    }>(path);
    const raw = res.data[0]?.avg?.[field];
    if (raw == null) return null;
    const n = typeof raw === 'string' ? Number.parseFloat(raw) : raw;
    return Number.isFinite(n) ? n : null;
  }

  // ─── PDF + storage ────────────────────────────────────────────────────

  async renderPdf(
    sponsor: SponsorRow,
    quarter: QuarterTag,
    rollup: DigestRollup,
    audiences: CohortSummary[],
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      // compress: false keeps text streams readable as plain bytes.
      // Single-page text-only digests are small enough (~6-10 KB)
      // that compression is not worth the trade-off; it also lets
      // the PII-boundary test grep the buffer directly.
      const doc = new PDFDocument({ size: 'A4', margin: 56, compress: false });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc
        .fontSize(22)
        .text('AI Qadam', { continued: true })
        .fontSize(14)
        .text('  ·  Quarterly sponsor digest', {
          align: 'left',
        });
      doc.moveDown(0.5);
      doc.fontSize(18).text(`Q${quarter.q} ${quarter.year} — ${sponsor.name}`);
      doc.moveDown(0.25);
      doc
        .fontSize(10)
        .fillColor('#666')
        .text(
          `Period: ${quarter.startsAt.slice(0, 10)} → ${quarter.endsAt.slice(0, 10)}  ·  Country: ${(sponsor.country ?? '—').toUpperCase()}`,
        );
      doc.moveDown(1);

      // Rollup table — Community signal
      doc.fillColor('#000').fontSize(14).text('Community signal');
      doc.moveDown(0.5);
      const csatStr = rollup.avgCsat == null ? '—' : `${rollup.avgCsat.toFixed(2)} / 5.00`;
      const attendanceRate =
        rollup.registrationCount > 0
          ? `${Math.round((rollup.attendedCount / rollup.registrationCount) * 100)}%`
          : '—';
      const rows: Array<[string, string]> = [
        ['Events held', String(rollup.eventCount)],
        ['Registrations', String(rollup.registrationCount)],
        ['Attended', `${rollup.attendedCount}  (${attendanceRate})`],
        ['Confirmed speakers', String(rollup.speakerCount)],
        ['Avg CSAT', csatStr],
      ];
      this.drawTable(doc, rows);
      doc.moveDown(1);

      // Entitled audiences
      doc.fontSize(14).text('Your audience entitlements');
      doc.moveDown(0.25);
      doc
        .fontSize(10)
        .fillColor('#666')
        .text(
          'Counts only — never raw member rows (per AI Qadam sponsor PII boundary). Cohort definitions live on the workspace partner cabinet.',
        );
      doc.moveDown(0.5);
      doc.fillColor('#000').fontSize(11);
      if (audiences.length === 0) {
        doc.text('(no cohort entitlements granted yet)');
      } else {
        const audienceRows: Array<[string, string]> = audiences.map((a) => [
          a.name,
          `${a.memberCount} members  ·  ${a.purpose}`,
        ]);
        this.drawTable(doc, audienceRows);
      }
      doc.moveDown(1);

      // Footer
      doc
        .fontSize(9)
        .fillColor('#888')
        .text(
          `Generated ${new Date().toISOString().slice(0, 10)} by AI Qadam.  ·  Questions? hello@aiqadam.org`,
          { align: 'center' },
        );

      doc.end();
    });
  }

  private drawTable(doc: PDFKit.PDFDocument, rows: Array<[string, string]>): void {
    const startX = doc.x;
    const colW = 220;
    for (const [k, v] of rows) {
      const y = doc.y;
      doc.fontSize(11).fillColor('#333').text(k, startX, y, { width: colW });
      doc
        .fontSize(11)
        .fillColor('#000')
        .text(v, startX + colW, y, { width: colW });
      doc.moveDown(0.4);
    }
  }

  private async uploadPdf(sponsor: SponsorRow, quarter: QuarterTag, pdf: Buffer): Promise<string> {
    const filename = `aiqadam-digest-${quarter.tag}-${sponsor.id}.pdf`;
    // Directus files endpoint accepts multipart/form-data. The lib's
    // post() helper takes a Blob-or-FormData; we use FormData here so
    // the boundary header is set correctly.
    const fd = new FormData();
    fd.append('title', `Q${quarter.q} ${quarter.year} — ${sponsor.name} digest`);
    fd.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), filename);
    const res = await this.directus.post<{ data: { id: string } }>('/files', fd);
    return res.data.id;
  }

  private async recordLedger(
    sponsorId: string,
    quarterTag: string,
    assetFileId: string,
  ): Promise<void> {
    await this.directus.post('/items/sponsor_digests', {
      sponsor: sponsorId,
      quarter_tag: quarterTag,
      asset_file_id: assetFileId,
    });
  }

  private async recordMarketingAsset(
    sponsorId: string,
    quarterTag: string,
    fileId: string,
  ): Promise<void> {
    await this.directus.post('/items/marketing_assets', {
      title: `Quarterly digest — ${quarterTag}`,
      category: 'quarterly-digest',
      visibility: 'sponsors',
      status: 'approved',
      sponsor: sponsorId,
      file: fileId,
    });
  }
}
