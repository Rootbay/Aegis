import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { DeviceHandshakePayload } from '$lib/utils/security';

let mockHandshake: DeviceHandshakePayload | null = null;
let hashStringMock = vi.fn();
let encryptWithSecretMock = vi.fn();
let verifyTotpMock = vi.fn();
const invokeMock = vi.fn();
const initializeMock = vi.fn();
const addToastMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('$lib/stores/userStore', () => ({
  userStore: {
    initialize: initializeMock,
    reset: vi.fn(),
  },
}));

vi.mock('$lib/stores/ToastStore', () => ({
  toasts: {
    addToast: addToastMock,
  },
}));

vi.mock('$lib/stores/persistentStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    persistentStore: (_key: string, initialValue: unknown) => {
      const store = writable(initialValue);
      return {
        subscribe: store.subscribe,
        set: store.set,
        update: store.update,
      };
    },
  };
});

vi.mock('$lib/utils/security', () => {
  hashStringMock = vi.fn(async (value: string) => `hash:${value}`);
  encryptWithSecretMock = vi.fn(async (secret: string, plain: string) => ({
    cipherText: `${secret}:${plain}`,
    iv: 'iv',
    salt: 'salt',
  }));
  verifyTotpMock = vi.fn(async (_secret: string, token: string) => token === '123456');
  return {
    generateRecoveryPhrase: vi.fn((count: number) => Array.from({ length: count }, () => 'word')),
    pickRecoveryConfirmationIndices: vi.fn(() => [0, 1, 2]),
    normalizeRecoveryPhrase: (input: string | string[]) => (Array.isArray(input) ? input.join(' ') : input),
    derivePasswordKey: vi.fn(async () => 'phrase-key'),
    hashString: hashStringMock,
    generateTotpSecret: vi.fn(() => 'TOTPMOCKSECRET'),
    buildTotpUri: vi.fn(() => 'otpauth://mock'),
    verifyTotp: verifyTotpMock,
    encryptWithSecret: encryptWithSecretMock,
    decryptWithSecret: vi.fn(async () => 'decrypted'),
    encodeDeviceHandshake: vi.fn(() => 'encoded-handshake'),
    decodeDeviceHandshake: vi.fn(() => mockHandshake),
  };
});

describe('authStore device handshake', () => {
  beforeEach(() => {
    mockHandshake = null;
    initializeMock.mockReset();
    addToastMock.mockReset();
    hashStringMock.mockClear();
    encryptWithSecretMock.mockClear();
    verifyTotpMock.mockClear();
    invokeMock.mockReset();
    invokeMock.mockImplementation(() => undefined);
  });

  it('persists credentials from an approved device handshake', async () => {
    const { authStore, authPersistenceStore } = await import('$lib/stores/authStore');
    authStore.__resetForTests?.();

    mockHandshake = {
      version: 1,
      password: 'SecurëPass💡',
      totpSecret: 'SHAREDSECRET',
      username: 'casey',
      issuedAt: Date.now(),
      recoveryEnvelope: null,
      recoveryHash: null,
      requireTotpOnUnlock: true,
    } satisfies DeviceHandshakePayload;

    authStore.ingestDeviceHandshake('qr://payload');
    await authStore.loginWithDeviceHandshake('123456');

    const persistence = get(authPersistenceStore);
    expect(persistence.passwordHash).toBe('hash:SecurëPass💡');
    expect(persistence.passwordEnvelope).toEqual({
      cipherText: 'SHAREDSECRET:SecurëPass💡',
      iv: 'iv',
      salt: 'salt',
    });
    expect(persistence.requireTotpOnUnlock).toBe(true);
    expect(typeof persistence.lastLoginAt).toBe('string');

    const state = get(authStore);
    expect(state.status).toBe('authenticated');
    expect(state.pendingDeviceLogin).toBeNull();
    expect(state.requireTotpOnUnlock).toBe(true);

    expect(initializeMock).toHaveBeenCalledWith('SecurëPass💡', { username: 'casey' });
    expect(hashStringMock).toHaveBeenCalledWith('SecurëPass💡');
    expect(encryptWithSecretMock).toHaveBeenCalledWith('SHAREDSECRET', 'SecurëPass💡');
    expect(verifyTotpMock).toHaveBeenCalledWith('SHAREDSECRET', '123456');
    expect(addToastMock).toHaveBeenCalledWith('Device approved and authenticated.', 'success');
  });

  it('falls back to existing unlock 2FA preference when handshake omits the flag', async () => {
    const { authStore, authPersistenceStore } = await import('$lib/stores/authStore');
    authStore.__resetForTests?.();

    mockHandshake = {
      version: 1,
      password: 'Another$ecret✓',
      totpSecret: 'LEGACYSECRET',
      username: 'casey',
      issuedAt: Date.now(),
      recoveryEnvelope: null,
      recoveryHash: null,
    } satisfies DeviceHandshakePayload;

    authStore.setRequireTotpOnUnlock(true);

    authStore.ingestDeviceHandshake('qr://payload');
    await authStore.loginWithDeviceHandshake('123456');

    const persistence = get(authPersistenceStore);
    expect(persistence.requireTotpOnUnlock).toBe(true);
  });

  it('allows legacy ASCII unlock passwords during identity migration', async () => {
    const { authStore } = await import('$lib/stores/authStore');
    authStore.__resetForTests?.();

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'is_identity_created') {
        return true;
      }
      return undefined;
    });

    await authStore.bootstrap();
    authStore.beginOnboarding('casey');

    expect(() => authStore.saveOnboardingPassword('LegacyOnly1')).not.toThrow();

    const state = get(authStore);
    expect(state.passwordPolicy).toBe('legacy_allowed');
    expect(state.onboarding?.password).toBe('LegacyOnly1');
  });
});
