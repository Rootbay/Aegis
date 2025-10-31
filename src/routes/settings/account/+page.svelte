<script lang="ts">
  import QRCode from "qrcode";
  import { userStore } from "$lib/stores/userStore";
  import {
    authStore,
    authPersistenceStore,
  } from "$lib/features/auth/stores/authStore";
  import { KeyRound, QrCode, ShieldCheck, Upload, Undo2 } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "$lib/components/ui/alert/index.js";
  import {
    Avatar,
    AvatarImage,
    AvatarFallback,
  } from "$lib/components/ui/avatar/index.js";

  const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
  const ACCEPTED_AVATAR_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
    "image/svg+xml",
  ]);

  let displayName = $state("");
  let profileBio = $state("");
  let profileMessage = $state<string | null>(null);
  let savingProfile = $state(false);

  let avatarUrl = $state("");
  let avatarPreview = $state<string | null>(null);
  let avatarFile = $state<File | null>(null);
  let avatarError = $state<string | null>(null);
  let avatarFileInput = $state<HTMLInputElement | null>(null);

  let totpCode = $state("");
  let totpSecret = $state<string | null>(null);
  let totpUri = $state<string | null>(null);
  let totpQr = $state<string | null>(null);
  let totpError = $state<string | null>(null);
  let revealingTotp = $state(false);

  let deviceTotp = $state("");
  let deviceQr = $state<string | null>(null);
  let deviceError = $state<string | null>(null);
  let generatingDeviceQr = $state(false);

  const requireTotpOnUnlock = $derived(
    $authPersistenceStore.requireTotpOnUnlock ?? false,
  );

  const profileAlertVariant = $derived(
    profileMessage && /error|fail|unable/i.test(profileMessage)
      ? "destructive"
      : "default",
  );

  const sanitizeCode = (value: string) =>
    value.replace(/[^0-9]/g, "").slice(0, 6);

  $effect(() => {
    const me = $userStore.me;
    if (me) {
      displayName = me.name;
      profileBio = me.bio ?? "";
      avatarPreview = me.avatar;
      avatarUrl = me.avatar;
    }
  });

  $effect(() => {
    const trimmed = avatarUrl.trim();
    const me = $userStore.me;

    if (avatarFile) {
      return;
    }

    if (!trimmed) {
      avatarPreview = me?.avatar ?? null;
      avatarError = null;
      return;
    }

    if (isValidAvatarInput(trimmed)) {
      avatarPreview = trimmed;
      avatarError = null;
      return;
    }

    avatarError =
      "Please provide a valid image URL (http, https, or data URI).";
  });

  async function saveProfile(event: Event) {
    event.preventDefault();
    const me = $userStore.me;
    if (!me) return;
    savingProfile = true;
    profileMessage = null;
    if (avatarError) {
      profileMessage = "Resolve avatar issues before saving.";
      savingProfile = false;
      return;
    }

    const trimmedName = displayName.trim();
    const trimmedBio = profileBio.trim();
    const trimmedAvatar = avatarUrl.trim();
    const fallbackAvatar = avatarPreview ?? me.avatar;
    const resolvedAvatar =
      trimmedAvatar.length > 0 ? trimmedAvatar : fallbackAvatar;
    try {
      await userStore.updateProfile({
        ...me,
        name: trimmedName,
        bio: trimmedBio,
        avatar: resolvedAvatar ?? me.avatar,
      });
      profileMessage = "Profile updated.";
    } catch (error) {
      profileMessage =
        error instanceof Error ? error.message : "Failed to update profile.";
    } finally {
      savingProfile = false;
    }
  }

  function handleAvatarUrlInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    avatarFile = null;
    avatarUrl = target.value;
  }

  function resetAvatarSelection() {
    const me = $userStore.me;
    avatarFile = null;
    avatarUrl = me?.avatar ?? "";
    avatarPreview = me?.avatar ?? null;
    avatarError = null;
    if (avatarFileInput) {
      avatarFileInput.value = "";
    }
  }

  function isValidAvatarInput(value: string) {
    if (value.startsWith("data:image/")) {
      return true;
    }
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          resolve(result);
        } else {
          reject(new Error("Unsupported file result."));
        }
      };
      reader.onerror = () => {
        reject(reader.error ?? new Error("Failed to read file."));
      };
      reader.readAsDataURL(file);
    });

  async function handleAvatarUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    avatarError = null;

    if (!file) {
      return;
    }

    if (file.type && !ACCEPTED_AVATAR_TYPES.has(file.type)) {
      avatarError = "Unsupported image type. Use PNG, JPG, GIF, SVG, or WebP.";
      input.value = "";
      avatarFile = null;
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      avatarError = "Avatar images must be 2 MB or smaller.";
      input.value = "";
      avatarFile = null;
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      avatarFile = file;
      avatarPreview = dataUrl;
      avatarUrl = dataUrl;
    } catch (error) {
      console.error("Failed to read avatar file", error);
      avatarError = "We couldn't read that image. Please try a different file.";
      avatarFile = null;
      input.value = "";
    }
  }

  async function revealTotp(event: Event) {
    event.preventDefault();
    revealingTotp = true;
    totpError = null;
    totpSecret = null;
    totpUri = null;
    totpQr = null;
    try {
      const result = await authStore.revealTotpSecret(totpCode);
      totpSecret = result.secret;
      totpUri = result.uri;
      totpQr = await QRCode.toDataURL(result.uri, { scale: 4, margin: 1 });
    } catch (error) {
      totpError =
        error instanceof Error ? error.message : "Unable to reveal 2FA secret.";
    } finally {
      revealingTotp = false;
      totpCode = "";
    }
  }

  async function handleGenerateDeviceQr(event: Event) {
    event.preventDefault();
    generatingDeviceQr = true;
    deviceError = null;
    deviceQr = null;
    try {
      const payload = await authStore.generateDeviceHandshake(deviceTotp);
      deviceQr = await QRCode.toDataURL(payload, { scale: 4, margin: 1 });
    } catch (error) {
      deviceError =
        error instanceof Error
          ? error.message
          : "Unable to generate device login.";
    } finally {
      generatingDeviceQr = false;
      deviceTotp = "";
    }
  }

  function handleToggleUnlockTotp(checked: boolean) {
    authStore.setRequireTotpOnUnlock(checked);
  }
</script>

<div class="space-y-8">
  <section
    class="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-6"
  >
    <div>
      <h1 class="text-2xl font-semibold text-zinc-50">Account</h1>
      <p class="text-sm text-zinc-400">
        Update your profile metadata and security configuration.
      </p>
    </div>

    <form class="grid gap-4 md:grid-cols-2" onsubmit={saveProfile}>
      <div class="md:col-span-2 space-y-4">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar class="size-24 border border-zinc-800 bg-zinc-950/80">
            <AvatarImage
              src={avatarPreview ?? undefined}
              alt={`Avatar preview for ${displayName || $userStore.me?.name || "your profile"}`}
            />
            <AvatarFallback class="text-xl font-semibold uppercase">
              {(displayName || $userStore.me?.name || "?")?.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div class="space-y-3 flex-1">
            <div class="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                class="gap-2"
                onclick={() => avatarFileInput?.click()}
                disabled={savingProfile}
              >
                <Upload size={16} />
                Upload image
              </Button>
              <Button
                type="button"
                variant="ghost"
                class="gap-2"
                onclick={resetAvatarSelection}
                disabled={savingProfile || !$userStore.me?.avatar}
              >
                <Undo2 size={16} />
                Reset
              </Button>
            </div>
            <div class="space-y-2">
              <label
                for="avatar-url"
                class="text-xs uppercase text-zinc-500"
                >Image URL</label
              >
              <Input
                id="avatar-url"
                type="url"
                value={avatarUrl}
                oninput={handleAvatarUrlInput}
                placeholder="https://example.com/avatar.png"
                disabled={savingProfile}
                aria-invalid={avatarError ? "true" : undefined}
              />
            </div>
            <p class="text-xs text-zinc-500">
              PNG, JPG, GIF, SVG, or WebP up to 2 MB. Data URLs are also
              supported.
            </p>
            {#if avatarError}
              <p class="text-sm text-destructive">{avatarError}</p>
            {/if}
          </div>
        </div>
        <input
          bind:this={avatarFileInput}
          type="file"
          class="sr-only"
          accept="image/*"
          onchange={handleAvatarUpload}
        />
      </div>
      <div class="space-y-2">
        <label for="display-name" class="text-sm font-medium text-zinc-300"
          >Display name</label
        >
        <Input
          id="display-name"
          type="text"
          bind:value={displayName}
          minlength={3}
          required
          disabled={savingProfile}
          class="w-full"
        />
      </div>
      <div class="space-y-2 md:col-span-2">
        <label for="profile-bio" class="text-sm font-medium text-zinc-300"
          >Bio</label
        >
        <Textarea
          id="profile-bio"
          bind:value={profileBio}
          maxlength={280}
          disabled={savingProfile}
          class="w-full min-h-[80px]"
        />
      </div>
      <div class="md:col-span-2 flex items-center justify-between gap-4">
        {#if profileMessage}
          <Alert class="flex-1" variant={profileAlertVariant}>
            <AlertDescription>{profileMessage}</AlertDescription>
          </Alert>
        {/if}
        <Button
          type="submit"
          disabled={savingProfile}
          aria-busy={savingProfile}
        >
          Save changes
        </Button>
      </div>
    </form>
  </section>

  <section
    class="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-6"
  >
    <div class="flex items-center gap-3">
      <KeyRound size={20} class="text-primary" />
      <div>
        <h2 class="text-xl font-semibold text-zinc-50">Time-based 2FA</h2>
        <p class="text-sm text-zinc-400">
          Authenticators secure new devices and can optionally be required for
          unlock.
        </p>
      </div>
    </div>

    <div
      class="flex items-start justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3"
    >
      <div>
        <p class="text-sm text-zinc-200">
          Require authenticator when unlocking
        </p>
        <p class="text-xs text-zinc-500">
          When disabled, only your password is needed to unlock. Codes are still
          mandatory for device approvals.
        </p>
      </div>
      <div class="flex items-center gap-3 text-sm text-zinc-200">
        <Switch
          class="shrink-0"
          checked={requireTotpOnUnlock}
          onCheckedChange={handleToggleUnlockTotp}
          aria-label="Require authenticator when unlocking"
        />
        <span>{requireTotpOnUnlock ? "Enabled" : "Disabled"}</span>
      </div>
    </div>

    <form class="space-y-4" onsubmit={revealTotp}>
      <div>
        <label
          for="reveal-totp"
          class="text-xs uppercase text-zinc-500 mb-1 block"
          >Authenticator code</label
        >
        <Input
          id="reveal-totp"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          value={totpCode}
          oninput={(event) => {
            const target = event.currentTarget as HTMLInputElement;
            totpCode = sanitizeCode(target.value);
          }}
          maxlength={6}
          required
          disabled={revealingTotp}
          class="w-full"
        />
      </div>
      <div class="flex items-center justify-between gap-4">
        <p class="text-sm text-zinc-400">
          Enter a fresh 6-digit code to reveal the provisioning secret.
        </p>
        <Button
          type="submit"
          variant="outline"
          disabled={totpCode.length !== 6 || revealingTotp}
          aria-busy={revealingTotp}
        >
          Reveal secret
        </Button>
      </div>
    </form>

    {#if totpError}
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{totpError}</AlertDescription>
      </Alert>
    {/if}

    {#if totpSecret && totpUri}
      <div class="grid gap-4 sm:grid-cols-[160px_1fr] items-start">
        {#if totpQr}
          <img
            src={totpQr}
            alt="TOTP QR"
            class="w-40 h-40 rounded-lg border border-zinc-700 bg-white p-2"
          />
        {/if}
        <div class="space-y-2 text-sm">
          <p class="text-zinc-300">
            Add this secret to any authenticator app that supports the TOTP
            standard.
          </p>
          <code
            class="block rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            >{totpSecret}</code
          >
          <p class="text-xs text-zinc-500">URI: {totpUri}</p>
        </div>
      </div>
    {/if}
  </section>

  <section
    class="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-6"
  >
    <div class="flex items-center gap-3">
      <QrCode size={20} class="text-primary" />
      <div>
        <h2 class="text-xl font-semibold text-zinc-50">
          Trusted device pairing
        </h2>
        <p class="text-sm text-zinc-400">
          Generate a short-lived QR to bring another device online. You still
          approve with 2FA.
        </p>
      </div>
    </div>

    <form class="space-y-4" onsubmit={handleGenerateDeviceQr}>
      <div>
        <label
          for="device-totp"
          class="text-xs uppercase text-zinc-500 mb-1 block"
          >Authenticator code</label
        >
        <Input
          id="device-totp"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          value={deviceTotp}
          oninput={(event) => {
            const target = event.currentTarget as HTMLInputElement;
            deviceTotp = sanitizeCode(target.value);
          }}
          maxlength={6}
          required
          disabled={generatingDeviceQr}
          class="w-full"
        />
      </div>
      <Button
        type="submit"
        disabled={deviceTotp.length !== 6 || generatingDeviceQr}
        aria-busy={generatingDeviceQr}
      >
        Generate login QR
      </Button>
    </form>

    {#if deviceError}
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{deviceError}</AlertDescription>
      </Alert>
    {/if}

    {#if deviceQr}
      <div class="flex flex-col items-center gap-3">
        <img
          src={deviceQr}
          alt="Device login QR"
          class="w-48 h-48 rounded-lg border border-zinc-700 bg-white p-3"
        />
        <p class="text-xs text-zinc-500">
          Scan this from the lock screen on a new device within 60 seconds.
        </p>
      </div>
    {/if}
  </section>

  <section
    class="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-4"
  >
    <div class="flex items-center gap-3">
      <ShieldCheck size={18} class="text-primary" />
      <h2 class="text-lg font-semibold text-zinc-50">Session activity</h2>
    </div>
    <div class="grid gap-2 sm:grid-cols-2 text-sm text-zinc-400">
      <div>
        <span class="block text-xs uppercase text-zinc-500"
          >Identity created</span
        >
        <span
          >{$authPersistenceStore.createdAt
            ? new Date($authPersistenceStore.createdAt).toLocaleString()
            : "Unknown"}</span
        >
      </div>
      <div>
        <span class="block text-xs uppercase text-zinc-500">Last unlocked</span>
        <span
          >{$authPersistenceStore.lastLoginAt
            ? new Date($authPersistenceStore.lastLoginAt).toLocaleString()
            : "No logins recorded"}</span
        >
      </div>
    </div>
  </section>
</div>
