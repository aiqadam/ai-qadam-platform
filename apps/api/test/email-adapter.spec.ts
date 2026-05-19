import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailService } from '../src/modules/email/email.service';
import { EmailAdapter } from '../src/modules/interactions/channels/email-adapter';

// Pure-mock around EmailService — verifies the adapter resolves both
// payload shapes (template + raw) and surfaces failures as AdapterResult
// instead of throwing.

type FakeEmail = { send: ReturnType<typeof vi.fn> };

let fake: FakeEmail;
let adapter: EmailAdapter;

beforeEach(() => {
  fake = { send: vi.fn().mockResolvedValue(undefined) };
  adapter = new EmailAdapter(fake as unknown as EmailService);
});

describe('EmailAdapter — template payload', () => {
  it('renders registration-confirmed and sends', async () => {
    const res = await adapter.send({
      recipient: { userId: 'u-1', email: 'alice@example.com' },
      intent: 'registered',
      payload: {
        template: 'registration-confirmed',
        data: {
          recipientName: 'Alice',
          eventTitle: 'AI Drinks UZ',
          eventStartsAt: '2026-06-01T18:00:00Z',
          eventLocation: 'Tashkent',
        },
      },
    });
    expect(res).toEqual({ state: 'sent' });
    expect(fake.send).toHaveBeenCalledTimes(1);
    const msg = fake.send.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      text: string;
      html: string;
    };
    expect(msg.to).toBe('alice@example.com');
    expect(msg.subject.length).toBeGreaterThan(0);
    expect(msg.text).toContain('Alice');
    expect(msg.text).toContain('AI Drinks UZ');
    expect(msg.html).toMatch(/<[a-z]/i);
  });

  it('renders registration-waitlisted with no location → uses Online fallback', async () => {
    const res = await adapter.send({
      recipient: { userId: 'u-2', email: 'b@c.com' },
      intent: 'waitlisted',
      payload: {
        template: 'registration-waitlisted',
        data: {
          eventTitle: 'Online ML Talk',
          eventStartsAt: '2026-07-01T10:00:00Z',
          eventLocation: null,
        },
      },
    });
    expect(res.state).toBe('sent');
    const msg = fake.send.mock.calls[0]?.[0] as { text: string };
    expect(msg.text).toContain('Online');
  });

  it('rejects template payload with bad shape', async () => {
    const res = await adapter.send({
      recipient: { userId: 'u-3', email: 'c@d.com' },
      intent: 'registered',
      payload: { template: 'registration-confirmed', data: { eventTitle: '' } },
    });
    expect(res.state).toBe('failed');
    expect(res.failureReason).toContain('payload invalid');
    expect(fake.send).not.toHaveBeenCalled();
  });

  it('rejects unknown template name', async () => {
    const res = await adapter.send({
      recipient: { userId: 'u-4', email: 'd@e.com' },
      intent: 'whatever',
      payload: { template: 'not-a-template', data: {} },
    });
    expect(res.state).toBe('failed');
    expect(fake.send).not.toHaveBeenCalled();
  });
});

describe('EmailAdapter — raw payload (backwards compat)', () => {
  it('sends a raw subject/text/html message', async () => {
    const res = await adapter.send({
      recipient: { userId: 'u-5', email: 'e@f.com' },
      intent: 'ad_hoc',
      payload: {
        subject: 'Hello',
        text: 'plain body',
        html: '<p>html body</p>',
      },
    });
    expect(res.state).toBe('sent');
    expect(fake.send).toHaveBeenCalledWith({
      to: 'e@f.com',
      subject: 'Hello',
      text: 'plain body',
      html: '<p>html body</p>',
    });
  });

  it('defaults html to escaped <pre> wrapper of text', async () => {
    await adapter.send({
      recipient: { userId: 'u-6', email: 'f@g.com' },
      intent: 'ad_hoc',
      payload: { subject: 'X', text: 'two & <three>' },
    });
    const msg = fake.send.mock.calls[0]?.[0] as { html: string };
    expect(msg.html).toBe('<pre>two &amp; &lt;three&gt;</pre>');
  });
});

describe('EmailAdapter — failure modes', () => {
  it('returns failed when recipient has no email', async () => {
    const res = await adapter.send({
      recipient: { userId: 'u-7', email: null },
      intent: 'ad_hoc',
      payload: { subject: 'X', text: 'y' },
    });
    expect(res.state).toBe('failed');
    expect(res.failureReason).toContain('no email');
    expect(fake.send).not.toHaveBeenCalled();
  });

  it('surfaces send-side throw as failed AdapterResult', async () => {
    fake.send.mockRejectedValueOnce(new Error('SMTP boom'));
    const res = await adapter.send({
      recipient: { userId: 'u-8', email: 'g@h.com' },
      intent: 'ad_hoc',
      payload: { subject: 'X', text: 'y' },
    });
    expect(res.state).toBe('failed');
    expect(res.failureReason).toContain('SMTP boom');
  });
});
