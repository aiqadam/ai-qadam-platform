import { describe, expect, it } from 'vitest';
import { registrationCancelled } from '../src/modules/email/templates/registration-cancelled';
import { registrationConfirmed } from '../src/modules/email/templates/registration-confirmed';

describe('registrationConfirmed template', () => {
  it('renders subject + text + html with the event details', () => {
    const msg = registrationConfirmed({
      recipientEmail: 'alice@example.com',
      recipientName: 'Alice',
      eventTitle: 'AI Drinks UZ',
      eventStartsAt: new Date('2026-06-01T18:00:00Z'),
      eventLocation: 'Tashkent, IT Park',
      webBaseUrl: 'https://aiqadam.org',
    });

    expect(msg.to).toBe('alice@example.com');
    expect(msg.subject).toBe("You're in: AI Drinks UZ");
    expect(msg.text).toContain('Hi Alice');
    expect(msg.text).toContain('AI Drinks UZ');
    expect(msg.text).toContain('Tashkent, IT Park');
    expect(msg.text).toContain('https://aiqadam.org/events');
    expect(msg.html).toContain('AI Drinks UZ');
    expect(msg.html).toContain('Tashkent, IT Park');
  });

  it('falls back to a generic greeting when no name is provided', () => {
    const msg = registrationConfirmed({
      recipientEmail: 'bob@example.com',
      eventTitle: 'Anything',
      eventStartsAt: new Date(),
      eventLocation: null,
      webBaseUrl: 'https://example.test',
    });
    expect(msg.text).toMatch(/^Hi,/m);
    expect(msg.text).toContain('Online');
  });

  it('escapes HTML in user-controlled fields to prevent injection', () => {
    const msg = registrationConfirmed({
      recipientEmail: 'eve@example.com',
      eventTitle: '<script>alert(1)</script>',
      eventStartsAt: new Date(),
      eventLocation: null,
      webBaseUrl: 'https://example.test',
    });
    expect(msg.html).not.toContain('<script>alert(1)</script>');
    expect(msg.html).toContain('&lt;script&gt;');
  });
});

import { registrationWaitlisted } from '../src/modules/email/templates/registration-waitlisted';

describe('registrationWaitlisted template', () => {
  it('renders a "waitlisted" subject + body with waitlist messaging', () => {
    const msg = registrationWaitlisted({
      recipientEmail: 'alice@example.com',
      recipientName: 'Alice',
      eventTitle: 'AI Drinks UZ',
      eventStartsAt: new Date('2026-06-01T18:00:00Z'),
      eventLocation: 'Tashkent',
      webBaseUrl: 'https://aiqadam.org',
    });
    expect(msg.subject).toBe('Waitlisted: AI Drinks UZ');
    expect(msg.text).toContain('on the waitlist');
    expect(msg.text).toContain('AI Drinks UZ');
    expect(msg.text).toContain('Tashkent');
    expect(msg.html).toContain('waitlist');
  });

  it('escapes HTML in user-controlled fields', () => {
    const msg = registrationWaitlisted({
      recipientEmail: 'eve@example.com',
      eventTitle: '<script>alert(1)</script>',
      eventStartsAt: new Date(),
      eventLocation: null,
      webBaseUrl: 'https://example.test',
    });
    expect(msg.html).not.toContain('<script>alert(1)</script>');
    expect(msg.html).toContain('&lt;script&gt;');
  });
});

describe('registrationCancelled template', () => {
  it('renders subject + text + html with the event title', () => {
    const msg = registrationCancelled({
      recipientEmail: 'alice@example.com',
      recipientName: 'Alice',
      eventTitle: 'AI Drinks UZ',
      webBaseUrl: 'https://aiqadam.org',
    });

    expect(msg.to).toBe('alice@example.com');
    expect(msg.subject).toBe('Cancelled: AI Drinks UZ');
    expect(msg.text).toContain('Hi Alice');
    expect(msg.text).toContain('AI Drinks UZ');
    expect(msg.text).toContain('https://aiqadam.org/events');
    expect(msg.html).toContain('AI Drinks UZ');
  });
});
