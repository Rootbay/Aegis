import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceHandshakePayload } from "$lib/utils/security";

let browserFlag = true;

vi.mock("$app/environment", () => ({
  get browser() {
    return browserFlag;
  },
}));

let mockHandshake: DeviceHandshakePayload | null = null;

const hashStringMock = vi.fn<(value: string) => Promise<string>>();
const encryptWithSecretMock =
  vi.fn<
    (
      secret: string,
      plain: string,
    ) => Promise<{ cipherText: string; iv: string; salt: string }>
  >();
const decryptWithSecretMock = vi.fn<
  (secret: string, envelope: { cipherText: string }) => Promise<string>
>();
const verifyTotpMock = vi.fn<(secret: string, token: string) => Promise<boolean>>();
const encodeDeviceHandshakeMock = vi.fn<(payload: DeviceHandshakePayload) => string>();
const decodeDeviceHandshakeMock = vi.fn<(raw: string) => DeviceHandshakePayload | null>();

vi.mock("$lib/utils/security", () => ({
  hashString: (...args: Parameters<typeof hashStringMock>) =>
    hashStringMock(...args),
  encryptWithSecret: (...args: Parameters<typeof encryptWithSecretMock>) =>
    encryptWithSecretMock(...args),
  decryptWithSecret: (...args: Parameters<typeof decryptWithSecretMock>) =>
    decryptWithSecretMock(...args),
  verifyTotp: (...args: Parameters<typeof verifyTotpMock>) =>
    verifyTotpMock(...args),
  encodeDeviceHandshake: (...args: Parameters<typeof encodeDeviceHandshakeMock>) =>
    encodeDeviceHandshakeMock(...args),
  decodeDeviceHandshake: (...args: Parameters<typeof decodeDeviceHandshakeMock>) =>
    decodeDeviceHandshakeMock(...args),
}));

describe("deviceHandshakeService", () => {
  beforeEach(() => {
    browserFlag = true;
    vi.resetModules();

    (globalThis as unknown as { navigator: Navigator }).navigator = {
      userAgent: "Mozilla/5.0 (Macintosh)",
      language: "en-US",
    } as Navigator;
    (globalThis as unknown as { screen: Screen }).screen = {
      width: 1440,
      height: 900,
    } as Screen;

    mockHandshake = null;

    hashStringMock.mockReset();
    hashStringMock.mockImplementation(async (value: string) => `hash:${value}`);

    encryptWithSecretMock.mockReset();
    encryptWithSecretMock.mockImplementation(async (secret, plain) => ({
      cipherText: `${secret}:${plain}`,
      iv: "iv",
      salt: "salt",
    }));

    decryptWithSecretMock.mockReset();
    decryptWithSecretMock.mockImplementation(async () => "decrypted-password");

    verifyTotpMock.mockReset();
    verifyTotpMock.mockImplementation(async (_secret, token) => token === "123456");

    encodeDeviceHandshakeMock.mockReset();
    encodeDeviceHandshakeMock.mockImplementation(() => "encoded-handshake");

    decodeDeviceHandshakeMock.mockReset();
    decodeDeviceHandshakeMock.mockImplementation(() => mockHandshake);
  });

  it("ingests device handshake payloads", async () => {
    mockHandshake = {
      version: 1,
      password: "secret",
      totpSecret: "TOTP",
      username: "casey",
      issuedAt: Date.now(),
      recoveryEnvelope: null,
      recoveryHash: null,
    } satisfies DeviceHandshakePayload;

    const mod = await import("$lib/features/auth/deviceHandshakeService");
    expect(mod.ingestDeviceHandshake("raw")).toEqual(mockHandshake);

    mockHandshake = null;
    expect(() => mod.ingestDeviceHandshake("raw")).toThrow(
      /Unrecognized device login QR payload/,
    );
  });

  it("approves device logins and produces persistence updates", async () => {
    mockHandshake = {
      version: 1,
      password: "SecurëPass",
      totpSecret: "SECRET",
      username: "casey",
      issuedAt: Date.now(),
      recoveryEnvelope: null,
      recoveryHash: null,
      requireTotpOnUnlock: true,
    } satisfies DeviceHandshakePayload;

    const mod = await import("$lib/features/auth/deviceHandshakeService");
    const { approveDeviceHandshake } = mod;

    const result = await approveDeviceHandshake({
      payload: mockHandshake,
      totpCode: "123456",
      persisted: { username: "casey", requireTotpOnUnlock: false },
    });

    expect(result.updatedPersistence).toMatchObject({
      passwordHash: "hash:SecurëPass",
      requireTotpOnUnlock: true,
      totpSecret: "SECRET",
      recoveryEnvelope: null,
    });
    expect(verifyTotpMock).toHaveBeenCalledWith("SECRET", "123456");
    expect(encryptWithSecretMock).toHaveBeenCalledWith("SECRET", "SecurëPass");
  });

  it("falls back to existing unlock preference when flag omitted", async () => {
    mockHandshake = {
      version: 1,
      password: "AnotherPass",
      totpSecret: "SECRET",
      username: "casey",
      issuedAt: Date.now(),
      recoveryEnvelope: null,
      recoveryHash: null,
    } satisfies DeviceHandshakePayload;

    const mod = await import("$lib/features/auth/deviceHandshakeService");
    const { approveDeviceHandshake } = mod;

    const result = await approveDeviceHandshake({
      payload: mockHandshake,
      totpCode: "123456",
      persisted: { requireTotpOnUnlock: true },
    });

    expect(result.updatedPersistence.requireTotpOnUnlock).toBe(true);
  });

  it("generates encoded device handshakes", async () => {
    const mod = await import("$lib/features/auth/deviceHandshakeService");
    const { createDeviceHandshake } = mod;

    const encoded = await createDeviceHandshake({
      totpCode: "123456",
      persisted: {
        username: "casey",
        totpSecret: "SECRET",
        passwordEnvelope: { cipherText: "SECRET:decrypted", iv: "iv", salt: "salt" },
        recoveryEnvelope: null,
        recoveryHash: null,
        requireTotpOnUnlock: true,
      },
    });

    expect(encoded).toBe("encoded-handshake");
    expect(decryptWithSecretMock).toHaveBeenCalled();
    expect(encodeDeviceHandshakeMock).toHaveBeenCalled();
  });

  it("uses fallback device info outside the browser", async () => {
    browserFlag = false;
    const mod = await import("$lib/features/auth/deviceHandshakeService");
    const info = await mod.getDeviceInfo();
    expect(info).toMatchObject({ id: "unknown", name: "Unknown Device" });
  });
});
