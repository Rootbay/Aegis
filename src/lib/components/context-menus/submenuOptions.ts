import type { ContextMenuItemConfig } from "./FloatingContextMenu.svelte";

export type ContextMenuOption = {
  id: string;
  label: string;
};

export const MUTE_OPTIONS: ContextMenuOption[] = [
  { id: "15m", label: "15 Minutes" },
  { id: "1h", label: "1 Hour" },
  { id: "8h", label: "8 Hours" },
  { id: "24h", label: "1 Day" },
  { id: "3d", label: "3 Days" },
  { id: "until_unmuted", label: "Until I Unmute" },
];

export const NOTIFICATION_OPTIONS: ContextMenuOption[] = [
  { id: "all_messages", label: "All Messages" },
  { id: "mentions_only", label: "Mentions Only" },
  { id: "nothing", label: "Nothing" },
  { id: "default", label: "Use Server Default" },
];

export function buildSubmenuItems<TOption extends ContextMenuOption>(
  options: TOption[],
  action: string,
): ContextMenuItemConfig<TOption>[] {
  return options.map((option) => ({
    label: option.label,
    action,
    data: option,
  }));
}

export function invokeSubmenuOption<TOption extends ContextMenuOption>(
  detail: { action: string; itemData: TOption | null },
  handler: (option: TOption) => void,
): void {
  const option = detail.itemData;
  if (!option) return;
  handler(option);
}
