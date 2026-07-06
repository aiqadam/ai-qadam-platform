/**
 * uat-session-driver.ts — Thin session driver for agent-driven UAT.
 *
 * Implements FR-WORKFLOW-004 §5 (one continuous browser context) and §6
 * (run-scoped evidence). The UATRunner agent calls these helpers step by step;
 * Playwright here is a dumb actuator, not the test orchestrator.
 *
 * Usage pattern (called by the UATRunner agent per step):
 *   const driver = await UATSessionDriver.create(options);
 *   await driver.goto(landingUrl);              // AC-1: one initial goto
 *   await driver.screenshot('step-001-landing'); // perceive
 *   // ... agent decides, acts:
 *   await driver.click(page.getByRole('button', { name: 'Submit' }));
 *   await driver.screenshot('step-001-submitted'); // judge
 *   driver.logStep('001', 'submit-lead-form', verdict);
 *   // ...
 *   await driver.writeTeardown(teardownRecord);
 *   await driver.close();
 *
 * The action-trace in session-log.md uses a structured format that
 * uat-navigation-check.sh can parse to enforce the one-goto rule (AC-2).
 *
 * @see docs/04-development/architecture/uat-agent-architecture.md §4-6
 */

import { chromium, type BrowserContext, type Page, type Locator } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Verdict = 'MATCH' | 'MISMATCH' | 'PARTIAL';

export interface StepVerdict {
  step: string;
  label: string;
  action: string;
  screenshotPath: string;
  verdict: Verdict;
  reasoning: string;
  /** VisualReviewer proof-of-look fields (required for uat-visual-check.sh) */
  visible_elements: string;
  rendered_text: string;
  dominant_colors: string;
  anomalies: string;
  corroborating_evidence?: string;
}

export interface TeardownRecord {
  policy: 'clean-up' | 'hand-off';
  /** What was removed (for clean-up) or left for downstream (for hand-off). */
  state: Array<{ item: string; action: string }>;
  notes?: string;
}

export interface SessionOptions {
  /** e.g. 'BP-UAT-013' */
  bpUat: string;
  /** workflow id or ISO timestamp for run-scoping */
  runId: string;
  /** v1 guard-rails; override from BP-UAT front-matter */
  budget?: {
    maxSteps?: number;
    maxScreenshots?: number;
    wallClockMinutes?: number;
  };
}

// ---------------------------------------------------------------------------
// Session driver
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '../../..');
const DEFAULT_BUDGET = { maxSteps: 40, maxScreenshots: 60, wallClockMinutes: 20 };

export class UATSessionDriver {
  private context: BrowserContext;
  readonly page: Page;
  private readonly runDir: string;
  private readonly logPath: string;
  private readonly options: Required<SessionOptions>;
  private stepCount = 0;
  private screenshotCount = 0;
  private readonly startTime = Date.now();
  private readonly logLines: string[] = [];
  private gotoCount = 0;

  private constructor(
    context: BrowserContext,
    page: Page,
    runDir: string,
    logPath: string,
    options: Required<SessionOptions>,
  ) {
    this.context = context;
    this.page = page;
    this.runDir = runDir;
    this.logPath = logPath;
    this.options = options;
  }

  static async create(options: SessionOptions): Promise<UATSessionDriver> {
    const budget = { ...DEFAULT_BUDGET, ...(options.budget ?? {}) };
    const fullOptions: Required<SessionOptions> = { ...options, budget };

    const runDir = path.join(
      REPO_ROOT,
      'apps/e2e/uat-results',
      options.bpUat,
      options.runId,
    );
    await fs.mkdir(runDir, { recursive: true });

    const logPath = path.join(runDir, 'session-log.md');
    await fs.writeFile(
      logPath,
      `# Session Log — ${options.bpUat}\n\n**Run ID:** ${options.runId}\n**Started:** ${new Date().toISOString()}\n**Budget:** max_steps=${budget.maxSteps}, max_screenshots=${budget.maxScreenshots}, wall_clock=${budget.wallClockMinutes}min\n\n---\n\n`,
    );

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    return new UATSessionDriver(context, page, runDir, logPath, fullOptions);
  }

  // -------------------------------------------------------------------------
  // Navigation — the one-goto rule (FR-WORKFLOW-004 AC-1 / AC-2)
  // -------------------------------------------------------------------------

  /**
   * Initial landing-page visit. May only be called once per session.
   * Subsequent navigations must happen through UI actions or declared hops.
   * Logs a structured GOTO action that uat-navigation-check.sh can parse.
   */
  async goto(url: string): Promise<void> {
    this.assertBudget();
    if (this.gotoCount > 0) {
      throw new Error(
        `UATSessionDriver: page.goto('${url}') called more than once. All navigation after the landing page must come from UI actions or declared external hops (see FR-WORKFLOW-004 AC-2 and uat-agent-architecture.md §4.2).`,
      );
    }
    this.gotoCount++;
    await this.page.goto(url);
    await this.appendLog(
      `**ACTION-TRACE:** GOTO url="${url}" type=landing step=initial\n`,
    );
  }

  /**
   * Declared external hop (mail catcher, email link, etc.).
   * Call this instead of goto() for any mid-session direct navigation.
   * The hop must be declared in the BP-UAT script's external_hops front-matter.
   * Logs a structured HOP action so uat-navigation-check.sh treats it as declared.
   */
  async externalHop(url: string, justification: string): Promise<void> {
    this.assertBudget();
    await this.page.goto(url);
    await this.appendLog(
      `**ACTION-TRACE:** HOP url="${url}" justification="${justification}"\n`,
    );
  }

  // -------------------------------------------------------------------------
  // Actions — log every UI interaction for the action trace
  // -------------------------------------------------------------------------

  async click(locator: Locator, label?: string): Promise<void> {
    this.assertBudget();
    const desc = label ?? 'locator';
    await locator.click();
    await this.appendLog(
      `**ACTION-TRACE:** CLICK target="${desc}" url="${this.page.url()}"\n`,
    );
  }

  async fill(locator: Locator, value: string, label?: string): Promise<void> {
    this.assertBudget();
    const desc = label ?? 'field';
    await locator.fill(value);
    await this.appendLog(
      `**ACTION-TRACE:** FILL target="${desc}" url="${this.page.url()}"\n`,
    );
  }

  async check(locator: Locator, label?: string): Promise<void> {
    this.assertBudget();
    const desc = label ?? 'checkbox';
    await locator.check();
    await this.appendLog(
      `**ACTION-TRACE:** CHECK target="${desc}" url="${this.page.url()}"\n`,
    );
  }

  // -------------------------------------------------------------------------
  // Screenshot — viewport only, run-scoped (FR-WORKFLOW-004 AC-7)
  // -------------------------------------------------------------------------

  /**
   * Capture a viewport screenshot, write it under the run-scoped dir, and
   * return the absolute path. The label should be 'step-NNN-<description>'
   * so uat-visual-check.sh can pair it with the step's verdict.
   */
  async screenshot(label: string): Promise<string> {
    this.assertBudget();
    this.screenshotCount++;
    if (this.screenshotCount > (this.options.budget.maxScreenshots ?? DEFAULT_BUDGET.maxScreenshots)) {
      throw new Error(`Session budget exceeded: max_screenshots=${this.options.budget.maxScreenshots}`);
    }
    const filename = `${label}.png`;
    const shotPath = path.join(this.runDir, filename);
    await this.page.screenshot({ path: shotPath, fullPage: false });
    await this.appendLog(
      `**SCREENSHOT:** ${filename} url="${this.page.url()}"\n`,
    );
    return shotPath;
  }

  // -------------------------------------------------------------------------
  // Step logging — structured perceive/decide/act/judge transcript
  // -------------------------------------------------------------------------

  /**
   * Log a completed step verdict. Must include the path of the screenshot
   * captured in this same step (enforced by uat-visual-check.sh AC-10b).
   */
  async logStep(verdict: StepVerdict): Promise<void> {
    this.stepCount++;
    if (this.stepCount > (this.options.budget.maxSteps ?? DEFAULT_BUDGET.maxSteps)) {
      throw new Error(`Session budget exceeded: max_steps=${this.options.budget.maxSteps}`);
    }
    const wallMin = (Date.now() - this.startTime) / 60000;
    if (wallMin > (this.options.budget.wallClockMinutes ?? DEFAULT_BUDGET.wallClockMinutes)) {
      throw new Error(`Session budget exceeded: wall_clock=${this.options.budget.wallClockMinutes}min`);
    }

    const block = [
      `### Step ${verdict.step} — ${verdict.label}`,
      '',
      `**Action:** ${verdict.action}`,
      `**Screenshot:** ${path.basename(verdict.screenshotPath)}`,
      `**Verdict:** ${verdict.verdict}`,
      '',
      '**Proof-of-look:**',
      `- visible_elements: ${verdict.visible_elements}`,
      `- rendered_text: ${verdict.rendered_text}`,
      `- dominant_colors: ${verdict.dominant_colors}`,
      `- anomalies: ${verdict.anomalies}`,
      '',
      `**Reasoning:** ${verdict.reasoning}`,
      verdict.corroborating_evidence
        ? `\n**Corroborating evidence:** ${verdict.corroborating_evidence}`
        : '',
      '',
      '---',
      '',
    ]
      .filter((l) => l !== undefined)
      .join('\n');

    await this.appendLog(block);
  }

  // -------------------------------------------------------------------------
  // Teardown — deliberate, logged (FR-WORKFLOW-004 AC-6)
  // -------------------------------------------------------------------------

  async writeTeardown(record: TeardownRecord): Promise<void> {
    const teardownPath = path.join(this.runDir, 'teardown.md');
    const lines = [
      `# Teardown — ${this.options.bpUat}`,
      '',
      `**Run ID:** ${this.options.runId}`,
      `**Policy:** ${record.policy}`,
      '',
      '## State',
      '',
      ...record.state.map((s) => `- **${s.item}:** ${s.action}`),
      '',
      record.notes ? `## Notes\n\n${record.notes}` : '',
    ].join('\n');
    await fs.writeFile(teardownPath, lines);
    await this.appendLog(
      `**TEARDOWN:** policy=${record.policy} items=${record.state.length} written to teardown.md\n`,
    );
  }

  // -------------------------------------------------------------------------
  // Close
  // -------------------------------------------------------------------------

  async close(): Promise<void> {
    const durationMin = ((Date.now() - this.startTime) / 60000).toFixed(1);
    await this.appendLog(
      `\n---\n\n**Session ended:** ${new Date().toISOString()} (${durationMin} min, ${this.stepCount} steps, ${this.screenshotCount} screenshots)\n`,
    );
    await this.context.browser()?.close();
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async appendLog(text: string): Promise<void> {
    await fs.appendFile(this.logPath, text);
  }

  private assertBudget(): void {
    const wallMin = (Date.now() - this.startTime) / 60000;
    const maxWall = this.options.budget.wallClockMinutes ?? DEFAULT_BUDGET.wallClockMinutes;
    if (wallMin > maxWall) {
      throw new Error(
        `Session budget exceeded: wall_clock=${maxWall}min (elapsed ${wallMin.toFixed(1)}min). Session ended failed-escalate; evidence retained in run-scoped directory.`,
      );
    }
  }
}