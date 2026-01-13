import { toasts } from "../stores/ToastStore";

export type ErrorContext = "auth" | "chat" | "network" | "server" | "generic";

export interface AppErrorOptions {
  context?: ErrorContext;
  showToast?: boolean;
  logToConsole?: boolean;
  duration?: number;
}

class ErrorService {
  handleError(error: unknown, options: AppErrorOptions = {}) {
    const {
      context = "generic",
      showToast = true,
      logToConsole = true,
      duration,
    } = options;

    const message = this.#extractMessage(error);
    const formattedMessage = this.#formatMessage(message, context);

    if (logToConsole) {
      console.error(`[${context.toUpperCase()}]`, error);
    }

    if (showToast) {
      toasts.showErrorToast(formattedMessage, duration);
    }

    return formattedMessage;
  }

  #extractMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  #formatMessage(message: string, context: ErrorContext): string {
    // Add context-specific prefixes or transformations if needed
    switch (context) {
      case "network":
        return `Connection error: ${message}`;
      case "auth":
        return `Authentication failed: ${message}`;
      default:
        return message;
    }
  }
}

export const errorService = new ErrorService();
