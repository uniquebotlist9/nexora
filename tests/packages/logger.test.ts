import { describe, expect, it } from 'vitest';
import { createLogger, errorId, serializeError } from '../../packages/logger/src/index';

describe('errorId', () => {
  it('is 8 characters long', () => {
    expect(errorId()).toHaveLength(8);
  });

  it('is uppercase alphanumeric', () => {
    for (let i = 0; i < 50; i++) {
      expect(errorId()).toMatch(/^[A-Z0-9]{8}$/);
    }
  });

  it('is not constant (unique-ish across calls)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(errorId());
    // 50 draws from a 36^8 space: collisions are astronomically unlikely.
    expect(seen.size).toBe(50);
  });
});

describe('serializeError', () => {
  it('serializes Error instances with message, stack and optional code', () => {
    const err = new Error('boom');
    const serialized = serializeError(err);
    expect(serialized.message).toBe('boom');
    expect(serialized.stack).toBe(err.stack);
    expect(serialized.code).toBeUndefined();

    const coded = Object.assign(new Error('db down'), { code: 'P1001' });
    expect(serializeError(coded).code).toBe('P1001');
  });

  it('stringifies plain objects', () => {
    expect(serializeError({ nope: true })).toEqual({ message: String({ nope: true }) });
  });

  it('stringifies primitives', () => {
    expect(serializeError('just a string')).toEqual({ message: 'just a string' });
    expect(serializeError(42)).toEqual({ message: '42' });
    expect(serializeError(null)).toEqual({ message: 'null' });
    expect(serializeError(undefined)).toEqual({ message: 'undefined' });
  });

  it('never throws for exotic inputs', () => {
    expect(() => serializeError(Symbol('s'))).not.toThrow();
    expect(() => serializeError(() => 'fn')).not.toThrow();
  });
});

describe('createLogger', () => {
  it('creates a pino logger with the given name as the service', () => {
    const logger = createLogger('test-logger');
    expect(logger.level).toBeDefined();
    // pino surfaces the root `name` option through bindings().
    expect(logger.bindings().name).toBe('test-logger');
    // The logger is functional: child bindings and info() do not throw.
    expect(() => logger.child({ guildId: '123' }).info('hello')).not.toThrow();
  });

  it('accepts bound context', () => {
    const logger = createLogger('ctx-logger', { shard: 2 });
    expect(() => logger.info('with context')).not.toThrow();
    expect(logger.bindings().service).toBe('ctx-logger');
  });
});
