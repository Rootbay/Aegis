import { vi } from "vitest";

type InvokeArgs = Record<string, unknown> | undefined;

type InvokeHandler = (cmd: string, args?: InvokeArgs) => Promise<unknown>;

type Listener = (payload: unknown) => void;

type ListenHandler = <T>(
  event: string,
  handler: Listener,
) => Promise<() => void>;

const defaultInvoke: InvokeHandler = async () => {
  throw new Error("invoke not implemented");
};

const defaultListen: ListenHandler = async () => () => {};

export const invoke = vi.fn(defaultInvoke);
export const convertFileSrc = vi.fn((path: string) => path);
export const listen = vi.fn(defaultListen);

export function __setInvokeImplementation(fn: InvokeHandler | null) {
  if (fn) {
    invoke.mockImplementation(fn);
  } else {
    invoke.mockImplementation(defaultInvoke);
  }
}

export function __setListenImplementation(fn: ListenHandler | null) {
  if (fn) {
    listen.mockImplementation(fn);
  } else {
    listen.mockImplementation(defaultListen);
  }
}

export function __resetTauriCoreMocks() {
  invoke.mockImplementation(defaultInvoke);
  invoke.mockClear();
  listen.mockImplementation(defaultListen);
  listen.mockClear();
  convertFileSrc.mockImplementation((path: string) => path);
  convertFileSrc.mockClear();
}
