<script lang="ts">
  import { get } from "svelte/store";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import {
    settings,
    setCommandPaletteShortcut,
    setPushToTalkShortcut,
    setToggleMuteShortcut,
  } from "$lib/features/settings/stores/settings";

  let commandPalette = $state(get(settings).commandPaletteShortcut);
  let pushToTalk = $state(get(settings).pushToTalkShortcut);
  let toggleMute = $state(get(settings).toggleMuteShortcut);

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      commandPalette = value.commandPaletteShortcut;
      pushToTalk = value.pushToTalkShortcut;
      toggleMute = value.toggleMuteShortcut;
    });
    return () => unsubscribe();
  });

  function normaliseShortcut(value: string) {
    return value
      .trim()
      .split("+")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join("+");
  }

  function handleBlur(type: "command" | "pushToTalk" | "toggleMute") {
    switch (type) {
      case "command":
        commandPalette = normaliseShortcut(commandPalette);
        setCommandPaletteShortcut(commandPalette);
        break;
      case "pushToTalk":
        pushToTalk = normaliseShortcut(pushToTalk);
        setPushToTalkShortcut(pushToTalk);
        break;
      case "toggleMute":
        toggleMute = normaliseShortcut(toggleMute);
        setToggleMuteShortcut(toggleMute);
        break;
      default:
        break;
    }
  }
</script>

<div class="space-y-6 p-4">
  <div>
    <h1 class="text-2xl font-semibold text-zinc-50">Keyboard shortcuts</h1>
    <p class="text-sm text-muted-foreground">
      Customise high-impact shortcuts. Use modifiers like Ctrl, Alt, Shift, or Cmd.
    </p>
  </div>

  <div class="space-y-4 max-w-lg">
    <div class="space-y-1">
      <Label class="text-sm font-medium text-zinc-200"
        >Command palette</Label
      >
      <Input
        bind:value={commandPalette}
        on:blur={() => handleBlur("command")}
        placeholder="Ctrl+K"
        aria-label="Command palette shortcut"
      />
      <p class="text-xs text-muted-foreground">
        Opens the universal launcher for channels, settings, and commands.
      </p>
    </div>

    <div class="space-y-1">
      <Label class="text-sm font-medium text-zinc-200"
        >Push-to-talk</Label
      >
      <Input
        bind:value={pushToTalk}
        on:blur={() => handleBlur("pushToTalk")}
        placeholder="Shift+Space"
        aria-label="Push-to-talk shortcut"
      />
      <p class="text-xs text-muted-foreground">
        Microphone remains muted until this shortcut is held down.
      </p>
    </div>

    <div class="space-y-1">
      <Label class="text-sm font-medium text-zinc-200"
        >Toggle mute</Label
      >
      <Input
        bind:value={toggleMute}
        on:blur={() => handleBlur("toggleMute")}
        placeholder="Ctrl+Shift+M"
        aria-label="Toggle mute shortcut"
      />
      <p class="text-xs text-muted-foreground">
        Quickly mute or unmute during calls or voice channels.
      </p>
    </div>
  </div>
</div>
