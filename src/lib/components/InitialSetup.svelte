<script lang="ts">
  import QRCode from 'qrcode';
  import { Lock, QrCode, ShieldCheck, KeyRound, Save, Scan, KeySquare } from '@lucide/svelte';
  import { authStore, authPersistenceStore } from '$lib/data/stores/authStore';
  import RecoveryQrScanner from './auth/RecoveryQrScanner.svelte';

  type OnboardingStep = 'username' | 'phrase' | 'confirm' | 'password' | 'totp';

  let username = $state('');
  let onboardingStep = $state<OnboardingStep>('username');
  let confirmationInputs = $state<Record<number, string>>({});
  let totpCode = $state('');
  let passwordInput = $state('');
  let passwordConfirm = $state('');
  let passwordError = $state<string | null>(null);

  let unlockPassword = $state('');
  let unlockPasswordError = $state<string | null>(null);
  let unlockTotp = $state('');

  let recoveryPhrase = $state('');
  let recoveryTotp = $state('');
  let recoveryPassword = $state('');
  let recoveryPasswordConfirm = $state('');
  let recoveryError = $state<string | null>(null);

  let deviceTotp = $state('');
  let showScanner = $state(false);
  let totpQr = $state<string | null>(null);
  let localError = $state<string | null>(null);

  const requireTotpOnUnlock = $derived($authPersistenceStore.requireTotpOnUnlock ?? false);

const unicodeRequired = $derived($authStore.passwordPolicy !== 'legacy_allowed');

  function sanitizeCode(value: string): string {
    return value.replace(/[^0-9]/g, '').slice(0, 6);
  }

  function validatePassword(value: string): string | null {
    if (value.length < 8) {
      return 'Password must be at least 8 characters long.';
    }
    if (unicodeRequired) {
      const hasUnicode = [...value].some((char) => {
        const point = char.codePointAt(0);
        return typeof point === 'number' && point > 0x7f;
      });
      if (!hasUnicode) {
        return 'Password must include at least one non-ASCII character.';
      }
    }
    return null;
  }

  $effect(() => {
    const onboarding = $authStore.onboarding;
    if (onboarding) {
      QRCode.toDataURL(onboarding.totpUri, { scale: 5, margin: 1 })
        .then((url) => { totpQr = url; })
        .catch((error) => console.error('Failed to generate TOTP QR:', error));
    } else {
      username = '';
      totpQr = null;
      confirmationInputs = {};
      totpCode = '';
      passwordInput = '';
      passwordConfirm = '';
      passwordError = null;
      onboardingStep = 'username';
    }
  });

  $effect(() => {
    if ($authStore.error) {
      localError = $authStore.error;
    } else {
      localError = null;
    }
  });

  const confirmReady = $derived(() => {
    const onboarding = $authStore.onboarding;
    if (!onboarding) return false;
    return onboarding.confirmationIndices.every((index) => (confirmationInputs[index] ?? '').trim().length > 0);
  });

  async function handleStartOnboarding(event: Event) {
    event.preventDefault();
    try {
      authStore.clearError();
      authStore.beginOnboarding(username);
      onboardingStep = 'phrase';
    } catch (error) {
      localError = error instanceof Error ? error.message : 'Unable to start setup.';
    }
  }

  function goToConfirmation() {
    onboardingStep = 'confirm';
  }

  function goToPasswordStep(event: Event) {
    event.preventDefault();
    onboardingStep = 'password';
  }

  async function handleSavePassword(event: Event) {
    event.preventDefault();
    authStore.clearError();
    passwordError = null;
    if (passwordInput !== passwordConfirm) {
      passwordError = 'Passwords do not match.';
      return;
    }
    const validation = validatePassword(passwordInput);
    if (validation) {
      passwordError = validation;
      return;
    }
    try {
      authStore.saveOnboardingPassword(passwordInput);
      onboardingStep = 'totp';
    } catch (error) {
      passwordError = error instanceof Error ? error.message : 'Unable to accept password.';
    }
  }

  async function finishOnboarding(event: Event) {
    event.preventDefault();
    if (!$authStore.onboarding) return;
    try {
      await authStore.completeOnboarding({ confirmations: confirmationInputs, totpCode });
    } catch {
      // handled by store
    }
  }

  async function handleUnlock(event: Event) {
    event.preventDefault();
    unlockPasswordError = null;
    try {
      await authStore.loginWithPassword(unlockPassword, requireTotpOnUnlock ? unlockTotp : undefined);
    } catch (error) {
      unlockPasswordError = error instanceof Error ? error.message : 'Unable to unlock.';
    }
  }

  async function handleRecoveryLogin(event: Event) {
    event.preventDefault();
    recoveryError = null;
    if (recoveryPassword !== recoveryPasswordConfirm) {
      recoveryError = 'Passwords do not match.';
      return;
    }
    const validation = validatePassword(recoveryPassword);
    if (validation) {
      recoveryError = validation;
      return;
    }
    try {
      await authStore.loginWithRecovery({
        phrase: recoveryPhrase,
        newPassword: recoveryPassword,
        totpCode: requireTotpOnUnlock ? recoveryTotp : undefined,
      });
      recoveryPhrase = '';
      recoveryTotp = '';
      recoveryPassword = '';
      recoveryPasswordConfirm = '';
    } catch (error) {
      recoveryError = error instanceof Error ? error.message : 'Recovery failed.';
    }
  }

  async function handleDeviceLogin(event: Event) {
    event.preventDefault();
    try {
      await authStore.loginWithDeviceHandshake(deviceTotp);
    } catch {
      // handled via store
    }
  }

  function handleScan(value: string) {
    try {
      authStore.clearError();
      authStore.ingestDeviceHandshake(value);
      showScanner = false;
    } catch (error) {
      localError = error instanceof Error ? error.message : 'Failed to process QR code.';
    }
  }

  function handleScannerError() {
    localError = 'Camera error: unable to start QR scanner.';
  }

  const isLoading = $derived($authStore.loading);
  const status = $derived($authStore.status);
</script>

<div class="min-h-screen w-full bg-zinc-950 text-zinc-100 flex items-center justify-center px-6 py-10 relative">
  {#if showScanner}
    <div class="absolute inset-0 z-40 flex items-center justify-center bg-zinc-950/90">
      <div class="bg-zinc-900/90 border border-zinc-800 rounded-xl shadow-xl p-6 w-full max-w-lg">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold flex items-center gap-2"><Scan size={18} /> Scan Trusted Device</h2>
          <button class="text-sm text-zinc-300 hover:text-white" onclick={() => (showScanner = false)}>Close</button>
        </div>
        <p class="text-sm text-zinc-400 mb-4">Point your camera at the login QR displayed on one of your trusted devices.</p>
        <RecoveryQrScanner on:result={(event) => handleScan(event.detail)} on:error={handleScannerError} />
      </div>
    </div>
  {/if}

  <div class="w-full max-w-4xl grid gap-8 lg:grid-cols-2">
    <div class="bg-zinc-900/80 border border-zinc-800 rounded-2xl shadow-2xl p-8 space-y-6">
      <div class="flex items-center gap-3">
        <ShieldCheck class="text-primary" size={24} />
        <div>
          <h1 class="text-2xl font-semibold">Aegis Authentication</h1>
          <p class="text-sm text-zinc-400">Offline-first security with recovery phrase, strong password, and optional unlock 2FA.</p>
        </div>
      </div>

      {#if localError}
        <div class="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {localError}
        </div>
      {/if}

      {#if status === 'needs_setup' || status === 'setup_in_progress'}
        {#if onboardingStep === 'username'}
          <form class="space-y-4" onsubmit={handleStartOnboarding}>
            <div>
              <label for="callsign" class="text-sm font-medium text-zinc-200 mb-2 block">Choose your callsign</label>
              <input id="callsign"
                type="text"
                class="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                placeholder="e.g. SentinelFox"
                bind:value={username}
                minlength={3}
                required
                disabled={isLoading}
              />
              <p class="mt-2 text-xs text-zinc-500">This username identifies you across Aegis. You can change it later once inside.</p>
            </div>
            <button class="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-primary/80 disabled:opacity-50" disabled={isLoading || username.trim().length < 3}>
              <ShieldCheck size={16} /> Begin secure setup
            </button>
          </form>
        {:else if onboardingStep === 'phrase' && $authStore.onboarding}
          <div class="space-y-4">
            <h2 class="text-lg font-semibold flex items-center gap-2"><Save size={18} /> Save your recovery phrase</h2>
            <p class="text-sm text-zinc-400">Write these 12 words down in order. They are the only way to rebuild your account if you forget your password.</p>
            <div class="grid grid-cols-3 gap-2 text-sm font-mono">
              {#each $authStore.onboarding.recoveryPhrase as word, index}
                <div class="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200">
                  <span class="text-xs text-zinc-500 mr-2">{index + 1}.</span>{word}
                </div>
              {/each}
            </div>
            <button class="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-primary/80" onclick={goToConfirmation}>
              I have stored my recovery phrase
            </button>
          </div>
        {:else if onboardingStep === 'confirm' && $authStore.onboarding}
          <form class="space-y-4" onsubmit={goToPasswordStep}>
            <h2 class="text-lg font-semibold flex items-center gap-2"><Save size={18} /> Verify two random words</h2>
            <p class="text-sm text-zinc-400">Enter the requested words to prove you saved the phrase correctly.</p>
            <div class="space-y-3">
              {#each $authStore.onboarding.confirmationIndices as index}
                <div>
                  <label for={`word-${index}`} class="text-xs uppercase tracking-wide text-zinc-500 mb-1 block">Word #{index + 1}</label>
                  <input id={`word-${index}`}
                    type="text"
                    class="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    oninput={(event) => {
                      const target = event.currentTarget as HTMLInputElement;
                      confirmationInputs = { ...confirmationInputs, [index]: target.value };
                    }}
                    value={confirmationInputs[index] ?? ''}
                    required
                    disabled={isLoading}
                  />
                </div>
              {/each}
            </div>
            <button class="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-primary/80 disabled:opacity-50" disabled={!confirmReady || isLoading}>
              Continue to password setup
            </button>
          </form>
        {:else if onboardingStep === 'password'}
          <form class="space-y-4" onsubmit={handleSavePassword}>
            <h2 class="text-lg font-semibold flex items-center gap-2"><KeySquare size={18} /> Create your unlock password</h2>
            {#if unicodeRequired}
              <p class="text-sm text-zinc-400">Minimum 8 characters and must include at least one non-ASCII character (for example “é”, “你”, or “✓”).</p>
            {:else}
              <p class="text-sm text-zinc-400">Minimum 8 characters. Unicode characters are optional while you upgrade an existing identity.</p>
            {/if}
            <div class="space-y-2">
              <label for="password" class="text-xs uppercase tracking-wide text-zinc-500 mb-1 block">Password</label>
              <input id="password"
                type="password"
                class="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                bind:value={passwordInput}
                minlength={8}
                required
                autocomplete="new-password"
              />
            </div>
            <div class="space-y-2">
              <label for="password-confirm" class="text-xs uppercase tracking-wide text-zinc-500 mb-1 block">Confirm password</label>
              <input id="password-confirm"
                type="password"
                class="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                bind:value={passwordConfirm}
                minlength={8}
                required
                autocomplete="new-password"
              />
            </div>
            {#if passwordError}
              <p class="text-sm text-red-300">{passwordError}</p>
            {/if}
            <button class="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-primary/80 disabled:opacity-50" disabled={isLoading}>
              Continue to authenticator setup
            </button>
          </form>
        {:else if onboardingStep === 'totp' && $authStore.onboarding}
          <form class="space-y-4" onsubmit={finishOnboarding}>
            <h2 class="text-lg font-semibold flex items-center gap-2"><KeyRound size={18} /> Pair your authenticator</h2>
            <p class="text-sm text-zinc-400">Scan this QR with your authenticator app. Codes are only required for unlock if you enable that option in settings.</p>
            <div class="flex flex-col lg:flex-row gap-4 items-start">
              {#if totpQr}
                <img src={totpQr} alt="Authenticator QR" class="w-40 h-40 rounded-lg border border-zinc-800 bg-white p-2" />
              {/if}
              <div class="space-y-2 text-sm">
                <p class="text-xs uppercase text-zinc-500">Manual setup key</p>
                <code class="block rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm">{$authStore.onboarding.totpSecret}</code>
              </div>
            </div>
            <div>
              <label for="totp-setup" class="text-xs uppercase tracking-wide text-zinc-500 mb-1 block">Authenticator code</label>
              <input id="totp-setup"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                class="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                value={totpCode}
                oninput={(event) => { const target = event.currentTarget as HTMLInputElement; totpCode = sanitizeCode(target.value); }}
                maxlength={6}
                required
                disabled={isLoading}
              />
            </div>
            <button class="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-primary/80 disabled:opacity-50" disabled={totpCode.length !== 6 || isLoading}>
              Complete onboarding
            </button>
          </form>
        {/if}
      {:else}
        <div class="space-y-6">
          <div class="space-y-2">
            <h2 class="text-lg font-semibold flex items-center gap-2"><Lock size={18} /> Unlock your identity</h2>
            <p class="text-sm text-zinc-400">Enter your password to decrypt your local identity. {#if requireTotpOnUnlock}A 6-digit authenticator code is required because you enabled it in settings.{/if}</p>
          </div>
          <form class="space-y-3" onsubmit={handleUnlock}>
            <div class="space-y-2">
              <label for="unlock-password" class="text-xs uppercase tracking-wide text-zinc-500">Password</label>
              <input id="unlock-password"
                type="password"
                class="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                bind:value={unlockPassword}
                required
                autocomplete="current-password"
              />
            </div>
            {#if requireTotpOnUnlock}
              <div class="space-y-2">
                <label for="unlock-totp" class="text-xs uppercase tracking-wide text-zinc-500">Authenticator code</label>
                <input id="unlock-totp"
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  class="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  value={unlockTotp}
                  oninput={(event) => { const target = event.currentTarget as HTMLInputElement; unlockTotp = sanitizeCode(target.value); }}
                  maxlength={6}
                  required
                />
              </div>
            {/if}
            {#if unlockPasswordError}
              <p class="text-sm text-red-300">{unlockPasswordError}</p>
            {/if}
            <button class="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-primary/80 disabled:opacity-50" disabled={isLoading || unlockPassword.trim().length === 0 || (requireTotpOnUnlock && unlockTotp.length !== 6)}>
              Unlock account
            </button>
          </form>

          <div class="space-y-2 pt-4 border-t border-zinc-800">
            <h3 class="text-sm font-semibold text-zinc-300 flex items-center gap-2"><KeyRound size={16} /> Recover with phrase</h3>
            <p class="text-xs text-zinc-500">Use your 12-word recovery phrase to reset your password. {#if requireTotpOnUnlock}Since unlock 2FA is enabled, we also ask for a 6-digit code.{/if}</p>
            <form class="space-y-3" onsubmit={handleRecoveryLogin}>
              <div class="space-y-2">
                <label for="recovery-phrase" class="text-xs uppercase tracking-wide text-zinc-500">Recovery phrase</label>
                <textarea id="recovery-phrase"
                  class="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-primary focus:outline-none min-h-[120px]"
                  placeholder="Enter your 12-word recovery phrase"
                  bind:value={recoveryPhrase}
                  required
                ></textarea>
              </div>
              {#if requireTotpOnUnlock}
                <div class="space-y-2">
                  <label for="recovery-totp" class="text-xs uppercase tracking-wide text-zinc-500">Authenticator code</label>
                  <input id="recovery-totp"
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    class="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    value={recoveryTotp}
                    oninput={(event) => { const target = event.currentTarget as HTMLInputElement; recoveryTotp = sanitizeCode(target.value); }}
                    maxlength={6}
                    required
                  />
                </div>
              {/if}
              <div class="space-y-2">
                <label for="recovery-password" class="text-xs uppercase tracking-wide text-zinc-500">New password</label>
                <input id="recovery-password"
                  type="password"
                  class="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  bind:value={recoveryPassword}
                  minlength={8}
                  required
                  autocomplete="new-password"
                />
              </div>
              <div class="space-y-2">
                <label for="recovery-password-confirm" class="text-xs uppercase tracking-wide text-zinc-500">Confirm new password</label>
                <input id="recovery-password-confirm"
                  type="password"
                  class="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  bind:value={recoveryPasswordConfirm}
                  minlength={8}
                  required
                  autocomplete="new-password"
                />
              </div>
              {#if recoveryError}
                <p class="text-sm text-red-300">{recoveryError}</p>
              {/if}
              <button class="w-full rounded-lg border border-primary px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-50" disabled={isLoading || recoveryPhrase.trim().length === 0 || recoveryPassword.trim().length === 0 || recoveryPasswordConfirm.trim().length === 0 || (requireTotpOnUnlock && recoveryTotp.length !== 6)}>
                Reset password & unlock
              </button>
            </form>
          </div>
        </div>
      {/if}
    </div>

    <div class="bg-zinc-900/50 border border-zinc-800 rounded-2xl shadow-inner p-8 space-y-6">
      <h2 class="text-lg font-semibold flex items-center gap-2"><QrCode size={18} /> Trusted device handoff</h2>
      <p class="text-sm text-zinc-400">Open Aegis on another device, generate a login QR from Settings → Devices, and scan it here. Approval still requires a fresh authenticator code.</p>

      {#if $authStore.pendingDeviceLogin}
        <div class="rounded-lg border border-primary/40 bg-primary/10 p-4 space-y-3">
          <p class="text-sm text-primary-foreground/90">Login request from { $authStore.pendingDeviceLogin.username ?? 'trusted device' }.</p>
          <form class="space-y-3" onsubmit={handleDeviceLogin}>
            <div>
              <label for="device-approve-totp" class="text-xs uppercase tracking-wide text-zinc-500">Authenticator code</label>
              <input id="device-approve-totp"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                class="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                value={deviceTotp}
                oninput={(event) => { const target = event.currentTarget as HTMLInputElement; deviceTotp = sanitizeCode(target.value); }}
                maxlength={6}
                required
                disabled={isLoading}
              />
            </div>
            <button class="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-primary/80 disabled:opacity-50" disabled={deviceTotp.length !== 6 || isLoading}>
              Approve login
            </button>
          </form>
        </div>
      {:else}
        <div class="rounded-lg border border-zinc-700/60 bg-zinc-900/60 p-4 text-sm text-zinc-400 space-y-3">
          <p>Ready to link another device? Generate a QR from your authenticated device to hand off credentials securely.</p>
          <button class="w-full rounded-lg border border-primary/60 px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/10" onclick={() => { authStore.clearError(); showScanner = true; }}>
            Launch camera scanner
          </button>
        </div>
      {/if}

      <div class="rounded-lg border border-zinc-700/60 bg-zinc-900/60 p-4 text-sm text-zinc-400">
        <p class="font-semibold text-zinc-200 mb-2">Security checklist</p>
        <ul class="space-y-2 list-disc list-inside">
          <li>Keep your recovery phrase offline in a trusted location.</li>
          <li>Password unlock works offline and never leaves this device.</li>
          <li>Authenticator codes remain required for device approvals.</li>
        </ul>
      </div>
    </div>
  </div>
</div>
