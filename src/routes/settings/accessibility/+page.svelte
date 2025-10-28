<script lang="ts">
  import { get } from "svelte/store";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
  } from "$lib/components/ui/select/index.js";
  import { Slider } from "$lib/components/ui/slider/index.js";
  import {
    settings,
    setHighContrastEnabled,
    setReducedMotionEnabled,
    setLiveCaptionsEnabled,
    setScreenReaderVerbosity,
    setTextToSpeechRate,
  } from "$lib/features/settings/stores/settings";

  const screenReaderVerbosityOptions: {
    label: string;
    value: "concise" | "detailed";
  }[] = [
    { label: "Concise", value: "concise" },
    { label: "Detailed", value: "detailed" },
  ];

  let highContrast = $state(get(settings).enableHighContrast);
  let reducedMotion = $state(get(settings).enableReducedMotion);
  let liveCaptions = $state(get(settings).enableLiveCaptions);
  let screenReaderVerbosity = $state<"concise" | "detailed">(
    get(settings).screenReaderVerbosity,
  );
  let speechRate = $state<[number]>([get(settings).textToSpeechRate]);

  const speechRateValue = $derived(speechRate[0]);
  const speechRateLabel = $derived(() => `${speechRateValue.toFixed(2)}×`);

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      highContrast = value.enableHighContrast;
      reducedMotion = value.enableReducedMotion;
      liveCaptions = value.enableLiveCaptions;
      screenReaderVerbosity = value.screenReaderVerbosity;
      if (speechRate[0] !== value.textToSpeechRate) {
        speechRate = [value.textToSpeechRate];
      }
    });

    return () => unsubscribe();
  });

  $effect(() => {
    const current = get(settings);
    if (current.enableHighContrast !== highContrast) {
      setHighContrastEnabled(highContrast);
    }
    if (current.enableReducedMotion !== reducedMotion) {
      setReducedMotionEnabled(reducedMotion);
    }
    if (current.enableLiveCaptions !== liveCaptions) {
      setLiveCaptionsEnabled(liveCaptions);
    }
    if (current.screenReaderVerbosity !== screenReaderVerbosity) {
      setScreenReaderVerbosity(screenReaderVerbosity);
    }
    if (current.textToSpeechRate !== speechRateValue) {
      setTextToSpeechRate(speechRateValue);
    }
  });
</script>

<h1 class="text-2xl font-semibold text-zinc-50">Accessibility</h1>

<div class="space-y-6">
  <section
    class="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="flex items-center justify-between gap-4">
      <div>
        <Label
          for="toggle-high-contrast"
          class="text-sm font-medium text-zinc-200"
        >
          Enable high contrast mode
        </Label>
        <p class="text-xs text-muted-foreground">
          Improves visibility for low-contrast elements across the interface.
        </p>
      </div>
      <Switch
        id="toggle-high-contrast"
        class="shrink-0"
        bind:checked={highContrast}
        aria-label="Toggle high contrast mode"
      />
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <Label
          for="toggle-reduced-motion"
          class="text-sm font-medium text-zinc-200"
        >
          Reduce motion
        </Label>
        <p class="text-xs text-muted-foreground">
          Limits animated transitions for a calmer and more stable experience.
        </p>
      </div>
      <Switch
        id="toggle-reduced-motion"
        class="shrink-0"
        bind:checked={reducedMotion}
        aria-label="Toggle reduced motion"
      />
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <Label
          for="toggle-live-captions"
          class="text-sm font-medium text-zinc-200"
        >
          Live captions for voice calls
        </Label>
        <p class="text-xs text-muted-foreground">
          Automatically display captions in supported voice and video calls.
        </p>
      </div>
      <Switch
        id="toggle-live-captions"
        class="shrink-0"
        bind:checked={liveCaptions}
        aria-label="Toggle live captions"
      />
    </div>
  </section>

  <section
    class="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="space-y-2">
      <Label class="text-sm font-medium text-zinc-200"
        >Screen reader verbosity</Label
      >
      <Select bind:value={screenReaderVerbosity}>
        <SelectTrigger class="w-full">
          {screenReaderVerbosityOptions.find(
            (option) => option.value === screenReaderVerbosity,
          )?.label ?? "Concise"}
        </SelectTrigger>
        <SelectContent>
          {#each screenReaderVerbosityOptions as option (option.value)}
            <SelectItem value={option.value}>{option.label}</SelectItem>
          {/each}
        </SelectContent>
      </Select>
      <p class="text-xs text-muted-foreground">
        Choose how much contextual detail the app announces when using screen
        readers.
      </p>
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <Label class="text-sm font-medium text-zinc-200"
          >Text-to-speech rate</Label
        >
        <span class="text-xs text-muted-foreground">{speechRateLabel}</span>
      </div>
      <Slider
        class="pt-2"
        min={0.5}
        max={2}
        step={0.05}
        bind:value={speechRate}
        aria-label="Adjust text-to-speech rate"
      />
      <p class="text-xs text-muted-foreground">
        Adjust narration speed used for built-in accessibility prompts.
      </p>
    </div>
  </section>
</div>
