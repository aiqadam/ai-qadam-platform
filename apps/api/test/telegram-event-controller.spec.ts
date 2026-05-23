import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the ops-events module so we can assert track() invocations
// without firing real HTTP to Plausible. Hoisted by vitest.
vi.mock('../src/lib/ops-events', () => ({
  track: vi.fn(),
}));

import { track } from '../src/lib/ops-events';
import { TelegramController } from '../src/modules/telegram/telegram.controller';
import type { TelegramService } from '../src/modules/telegram/telegram.service';
import type { TgConfigService } from '../src/modules/telegram/tg-config.service';

const trackMock = vi.mocked(track);

// Service stubs — the event endpoint doesn't touch them. We pass {} as
// unknown casts to satisfy the controller constructor.
const telegram = {} as unknown as TelegramService;
const config = {} as unknown as TgConfigService;

beforeEach(() => {
  trackMock.mockClear();
});

describe('TelegramController.event (F-R4)', () => {
  const controller = new TelegramController(telegram, config);

  it('accepts a whitelisted tg.bot.* event and forwards to Plausible', async () => {
    const res = await controller.event({
      name: 'tg.bot.link_started',
      props: { tg_user_id: '12345', tenant: 'uz' },
    });
    expect(res).toEqual({ accepted: true });
    expect(trackMock).toHaveBeenCalledWith('tg.bot.link_started', {
      tg_user_id: '12345',
      tenant: 'uz',
    });
  });

  it('accepts a whitelisted tg.notifier.* event', async () => {
    await controller.event({ name: 'tg.notifier.message_sent', props: { kind: 'reminder_3h' } });
    expect(trackMock).toHaveBeenCalledWith('tg.notifier.message_sent', { kind: 'reminder_3h' });
  });

  it('accepts an event with no props', async () => {
    await controller.event({ name: 'tg.bot.started' });
    expect(trackMock).toHaveBeenCalledWith('tg.bot.started', {});
  });

  it('accepts numeric prop values', async () => {
    await controller.event({ name: 'tg.bot.heartbeat', props: { uptime_sec: 1234 } });
    expect(trackMock).toHaveBeenCalledWith('tg.bot.heartbeat', { uptime_sec: 1234 });
  });

  it('REJECTS names outside the tg.bot.* / tg.notifier.* namespace', async () => {
    // Auth-system event name forged by a malicious bot.
    await expect(controller.event({ name: 'auth.failed', props: {} })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('REJECTS names with the right prefix but invalid suffix chars', async () => {
    await expect(
      controller.event({ name: 'tg.bot.<script>alert(1)</script>' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('REJECTS bare prefix (no event identifier)', async () => {
    await expect(controller.event({ name: 'tg.bot.' })).rejects.toBeInstanceOf(BadRequestException);
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('REJECTS overly long names', async () => {
    const huge = `tg.bot.${'a'.repeat(200)}`;
    await expect(controller.event({ name: huge })).rejects.toBeInstanceOf(BadRequestException);
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('REJECTS missing name', async () => {
    await expect(controller.event({ props: { x: '1' } })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('REJECTS non-string non-number prop values', async () => {
    await expect(
      controller.event({ name: 'tg.bot.test', props: { nested: { evil: true } } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(trackMock).not.toHaveBeenCalled();
  });
});
