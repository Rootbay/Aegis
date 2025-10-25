<script lang="ts">
  import { theme } from "$lib/stores/theme";
  import { Label } from "$lib/components/ui/label/index.js";
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
  } from "$lib/components/ui/select/index.js";
  import { Slider } from "$lib/components/ui/slider/index.js";

  let currentTheme = $state<"light" | "dark">("light");
  let fontSize = $state<[number]>([16]);

  const fontSizeValue = $derived(fontSize[0]);

  $effect(() => {
    const unsubscribe = theme.subscribe((value) => (currentTheme = value));
    return () => unsubscribe();
  });

  function handleThemeChange(value: string) {
    if (value === "light" || value === "dark") {
      currentTheme = value;
      theme.set(value);
    }
  }
</script>

<h1 class="text-2xl font-semibold text-zinc-50">Appearance Settings</h1>

<div class="space-y-6 max-w-md">
  <div class="space-y-2">
    <Label for="theme" class="text-sm font-medium text-zinc-200">Theme</Label>
    <Select
      type="single"
      value={currentTheme}
      onValueChange={handleThemeChange}
    >
      <SelectTrigger id="theme" class="w-full">
        <span data-slot="select-value" class="flex-1 text-left capitalize">
          {currentTheme}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="light">Light</SelectItem>
        <SelectItem value="dark">Dark</SelectItem>
      </SelectContent>
    </Select>
  </div>

  <div class="space-y-2">
    <Label for="font-size" class="text-sm font-medium text-zinc-200">
      Font size
    </Label>
    <Slider
      id="font-size"
      type="single"
      min={12}
      max={20}
      step={1}
      bind:value={fontSize}
    />
    <p class="text-xs text-muted-foreground">
      Interface text is set to {fontSizeValue}px.
    </p>
  </div>
</div>
