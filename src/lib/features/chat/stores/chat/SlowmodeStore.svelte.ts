import { SvelteMap } from "svelte/reactivity";

export interface SlowmodeTracker {
  cooldownSeconds: number;
  availableAt: number;
}

export class SlowmodeStore {
  #slowmodeByChannelId = new SvelteMap<string, SlowmodeTracker>();

  get slowmodeByChannelId() { return this.#slowmodeByChannelId; }

  setSlowmode(channelId: string, cooldown: number) {
    if (cooldown <= 0) {
      this.#slowmodeByChannelId.delete(channelId);
    } else {
      this.#slowmodeByChannelId.set(channelId, {
        cooldownSeconds: cooldown,
        availableAt: Date.now() + cooldown * 1000,
      });
    }
  }

  getRemainingSeconds(channelId: string): number {
    const tracker = this.#slowmodeByChannelId.get(channelId);
    if (!tracker) return 0;
    const remaining = Math.ceil((tracker.availableAt - Date.now()) / 1000);
    return Math.max(0, remaining);
  }

  clearSlowmode(channelId: string) {
    this.#slowmodeByChannelId.delete(channelId);
  }
}
