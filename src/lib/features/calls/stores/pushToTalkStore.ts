import { get, type Readable } from "svelte/store";
import { settings } from "$lib/features/settings/stores/settings";

type ParsedShortcut = {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
};

export interface PushToTalkState {
  enabled: boolean;
  isPressing: boolean;
  shortcut: string;
}

interface PushToTalkController extends Readable<PushToTalkState> {
  enable: () => void;
  disable: () => void;
  toggle: () => void;
  setEnabled: (enabled: boolean) => void;
  reset: () => void;
  readonly state: PushToTalkState;
}

const isBrowser = typeof window !== "undefined";

function normaliseKeySegment(segment: string): string | null {
  const lower = segment.toLowerCase();
  switch (lower) {
    case "":
      return null;
    case "space":
    case "spacebar":
      return " ";
    case "esc":
      return "escape";
    case "return":
      return "enter";
    case "plus":
      return "+";
    case "arrowup":
    case "arrowdown":
    case "arrowleft":
    case "arrowright":
      return lower;
    default:
      return lower;
  }
}

function normaliseEventKey(key: string): string {
  if (key === " ") {
    return " ";
  }
  return key.toLowerCase();
}

function parseShortcut(shortcut: string): ParsedShortcut | null {
  const segments = shortcut
    .split("+")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  let keySegment: string | null = null;
  let ctrlKey = false;
  let altKey = false;
  let shiftKey = false;
  let metaKey = false;

  for (const segment of segments) {
    const lower = segment.toLowerCase();
    switch (lower) {
      case "ctrl":
      case "control":
        ctrlKey = true;
        break;
      case "alt":
      case "option":
        altKey = true;
        break;
      case "shift":
        shiftKey = true;
        break;
      case "cmd":
      case "meta":
      case "command":
      case "win":
      case "super":
        metaKey = true;
        break;
      default:
        keySegment = segment;
        break;
    }
  }

  if (!keySegment) {
    return null;
  }

  const key = normaliseKeySegment(keySegment);
  if (!key) {
    return null;
  }

  return { key, ctrlKey, altKey, shiftKey, metaKey } satisfies ParsedShortcut;
}

function matchesShortcut(event: KeyboardEvent, binding: ParsedShortcut): boolean {
  if (event.ctrlKey !== binding.ctrlKey) return false;
  if (event.altKey !== binding.altKey) return false;
  if (event.shiftKey !== binding.shiftKey) return false;
  if (event.metaKey !== binding.metaKey) return false;
  return normaliseEventKey(event.key) === binding.key;
}

function isModifierKey(key: string, binding: ParsedShortcut): boolean {
  const lower = key.toLowerCase();
  if ((lower === "control" || lower === "ctrl") && binding.ctrlKey) {
    return true;
  }
  if ((lower === "alt" || lower === "option") && binding.altKey) {
    return true;
  }
  if (lower === "shift" && binding.shiftKey) {
    return true;
  }
  if ((lower === "meta" || lower === "os" || lower === "super") && binding.metaKey) {
    return true;
  }
  return false;
}

function createPushToTalkStore(): PushToTalkController {
  const initialShortcut = (() => {
    try {
      return get(settings).pushToTalkShortcut ?? "";
    } catch (_error) {
      return "";
    }
  })();

  let state: PushToTalkState = {
    enabled: false,
    isPressing: false,
    shortcut: initialShortcut,
  };

  let binding: ParsedShortcut | null = parseShortcut(initialShortcut);
  let pressed = false;
  let settingsUnsubscribe: (() => void) | null = null;
  let listenersAttached = false;
  const subscribers = new Set<(value: PushToTalkState) => void>();
  const cleanupCallbacks = new Set<() => void>();

  function notify() {
    subscribers.forEach((run) => run(state));
  }

  function setState(partial: Partial<PushToTalkState>) {
    const next = { ...state, ...partial } as PushToTalkState;
    if (
      next.enabled === state.enabled &&
      next.isPressing === state.isPressing &&
      next.shortcut === state.shortcut
    ) {
      return;
    }
    state = next;
    notify();
  }

  function resetPressing() {
    if (!pressed && !state.isPressing) {
      return;
    }
    pressed = false;
    setState({ isPressing: false });
  }

  function attachListeners() {
    if (!isBrowser || listenersAttached) {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (!state.enabled || !binding) {
        return;
      }
      if (event.repeat) {
        return;
      }
      if (!matchesShortcut(event, binding)) {
        return;
      }
      pressed = true;
      setState({ isPressing: true });
    };

    const handleKeyup = (event: KeyboardEvent) => {
      if (!pressed) {
        return;
      }
      if (!binding) {
        resetPressing();
        return;
      }
      const key = normaliseEventKey(event.key);
      if (key === binding.key || isModifierKey(key, binding)) {
        resetPressing();
      }
    };

    const handleBlur = () => {
      resetPressing();
    };

    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("keyup", handleKeyup);
    window.addEventListener("blur", handleBlur);

    listenersAttached = true;

    cleanupCallbacks.add(() => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("keyup", handleKeyup);
      window.removeEventListener("blur", handleBlur);
      listenersAttached = false;
    });
  }

  function detachListeners() {
    cleanupCallbacks.forEach((cleanup) => cleanup());
    cleanupCallbacks.clear();
  }

  function startSettingsSubscription() {
    if (settingsUnsubscribe || !isBrowser) {
      return;
    }

    settingsUnsubscribe = settings.subscribe((value) => {
      const shortcut = value.pushToTalkShortcut ?? "";
      if (shortcut !== state.shortcut) {
        binding = parseShortcut(shortcut);
        pressed = false;
        setState({ shortcut, isPressing: false });
      }
    });

    cleanupCallbacks.add(() => {
      settingsUnsubscribe?.();
      settingsUnsubscribe = null;
    });

  }

  function ensureActive() {
    startSettingsSubscription();
    attachListeners();
  }

  function subscribe(run: (value: PushToTalkState) => void) {
    subscribers.add(run);
    run(state);

    if (subscribers.size === 1) {
      ensureActive();
    }

    return () => {
      subscribers.delete(run);
      if (subscribers.size === 0) {
        detachListeners();
        settingsUnsubscribe?.();
        settingsUnsubscribe = null;
        binding = null;
        pressed = false;
      }
    };
  }

  function setEnabled(enabled: boolean) {
    if (enabled) {
      ensureActive();
    }
    if (!enabled) {
      resetPressing();
    }
    setState({ enabled });
  }

  function toggle() {
    setEnabled(!state.enabled);
  }

  function reset() {
    resetPressing();
    setState({ enabled: false });
  }

  return {
    subscribe,
    enable: () => setEnabled(true),
    disable: () => setEnabled(false),
    toggle,
    setEnabled,
    reset,
    get state() {
      return state;
    },
  } satisfies PushToTalkController;
}

export const pushToTalkStore = createPushToTalkStore();
