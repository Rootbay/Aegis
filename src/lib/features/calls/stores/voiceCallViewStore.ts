import { writable } from "svelte/store";

const voiceCallViewChannelId = writable<string | null>(null);

export const voiceCallViewStore = voiceCallViewChannelId;

export function showVoiceCallView(channelId: string) {
  voiceCallViewChannelId.set(channelId);
}

export function hideVoiceCallView() {
  voiceCallViewChannelId.set(null);
}
