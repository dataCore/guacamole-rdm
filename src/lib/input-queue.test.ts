import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputQueue } from './input-queue';

describe('InputQueue', () => {
  let queue: InputQueue;
  let sent: string[];
  const event = (name: string) => () => sent.push(name);

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new InputQueue();
    sent = [];
  });
  afterEach(() => vi.useRealTimers());

  it('sends at once while nothing is held', () => {
    queue.send(event('a'));
    expect(sent).toEqual(['a']);
    expect(queue.holding).toBe(false);
  });

  it('keeps everything after a held event in order', () => {
    queue.hold(event('click'), 1000);
    queue.send(event('key'));
    queue.hold(event('chord'), 200);
    queue.send(event('move'));
    expect(sent).toEqual([]);
    queue.release();
    expect(sent).toEqual(['click', 'key', 'chord', 'move']);
    expect(queue.holding).toBe(false);
  });

  it('releases at the latest after the limit of the first hold', () => {
    queue.hold(event('a'), 1000);
    queue.hold(event('b'), 5000);
    vi.advanceTimersByTime(999);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual(['a', 'b']);
  });

  it('releaseIn replaces an earlier release time', () => {
    queue.hold(event('a'), 1000);
    queue.releaseIn(300);
    queue.releaseIn(100);
    vi.advanceTimersByTime(100);
    expect(sent).toEqual(['a']);
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual(['a']);
  });

  it('releaseIn(0) releases at once and does nothing when idle', () => {
    queue.releaseIn(0);
    expect(queue.holding).toBe(false);
    queue.hold(event('a'), 1000);
    queue.releaseIn(0);
    expect(sent).toEqual(['a']);
  });

  it('clear drops held events and stops their timers', () => {
    queue.hold(event('old'), 1000);
    queue.releaseIn(300);
    queue.clear();
    queue.hold(event('new'), 5000);
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([]);
    queue.release();
    expect(sent).toEqual(['new']);
  });

  it('is open again when a released event throws', () => {
    queue.hold(() => {
      throw new Error('tunnel closed');
    }, 1000);
    expect(() => queue.release()).toThrow('tunnel closed');
    expect(queue.holding).toBe(false);
    queue.send(event('next'));
    expect(sent).toEqual(['next']);
  });
});
