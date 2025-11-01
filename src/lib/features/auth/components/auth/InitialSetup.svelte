<script lang="ts">
  import QRCode from "qrcode";
  import {
    Eye,
    EyeOff,
    Shield,
    ShieldCheck,
    TriangleAlert,
    KeyRound,
    Save,
    Scan,
    KeySquare,
    QrCode,
    Lock,
    ArrowLeftRight,
    LogOut,
    UserPlus,
  } from "@lucide/svelte";
  import {
    authStore,
    authPersistenceStore,
    MIN_PASSWORD_LENGTH,
    validatePassword,
  } from "$lib/features/auth/stores/authStore";
  import { toasts } from "$lib/stores/ToastStore";
  import type { SecurityQuestion } from "$lib/features/auth/stores/authStore";
  import RecoveryQrScanner from "./RecoveryQrScanner.svelte";
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
  } from "$lib/components/ui/select/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import {
    Dialog,
    DialogHeader,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from "$lib/components/ui/dialog/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";

  type OnboardingStep =
    | "username"
    | "phrase"
    | "confirm"
    | "password"
    | "totp"
    | "security_questions"
    | "backup_codes";

  type SecurityQuestionInput = { question: string; answer: string };
  let username = $state("");
  let onboardingStep = $state<OnboardingStep>("username");
  let confirmationInputs = $state<Record<number, string>>({});
  let totpCode = $state("");
  let passwordInput = $state("");
  let passwordConfirm = $state("");
  let unlockPassword = $state("");
  let unlockPasswordError = $state<string | null>(null);
  let unlockTotp = $state("");
  let unlockPending = $state(false);
  let securityQuestionAnswers = $state<Record<string, string>>({});
  let recoveryPhrase = $state("");
  let recoveryTotp = $state("");
  let recoveryPassword = $state("");
  let recoveryPasswordConfirm = $state("");
  let deviceTotp = $state("");
  let showScanner = $state(false);
  let totpQr = $state<string | null>(null);

  let passwordStrength = $state<{ score: number; feedback: string[] }>({
    score: 0,
    feedback: [],
  });

  let showPassword = $state(false);
  let securityQuestions = $state<SecurityQuestionInput[]>([]);
  let backupCodes = $state<string[]>([]);
  let showRecoveryForm = $state(false);
  type SupportView = "unlock" | "recovery" | "handoff";
  let activeView = $state<SupportView>("unlock");

  const requireTotpOnUnlock = $derived(
    $authPersistenceStore.requireTotpOnUnlock ?? false,
  );

  const storedSecurityQuestions = $derived(
    ($authPersistenceStore.securityQuestions ?? []) as SecurityQuestion[],
  );

  const recoveryQuestionPrompts = $derived(
    storedSecurityQuestions.map((item) => item.question),
  );

  const answeredRecoveryQuestions = $derived(
    recoveryQuestionPrompts.reduce((total, prompt) => {
      const response = securityQuestionAnswers[prompt];

      return response?.trim().length >= 2 ? total + 1 : total;
    }, 0),
  );

  const unicodeRequired = $derived(
    $authStore.passwordPolicy !== "legacy_allowed",
  );

  const recoveryPasswordValidation = $derived(
    recoveryPassword
      ? validatePassword(recoveryPassword, unicodeRequired, true)
      : null,
  );

  const recoveryFormReady = $derived(
    recoveryQuestionPrompts.length > 0 &&
      answeredRecoveryQuestions >= 2 &&
      recoveryPassword.length > 0 &&
      recoveryPasswordConfirm.length > 0 &&
      recoveryPassword === recoveryPasswordConfirm &&
      !recoveryPasswordValidation &&
      (!requireTotpOnUnlock || recoveryTotp.length === 6),
  );

  function sanitizeCode(value: string): string {
    return value.replace(/[^0-9]/g, "").slice(0, 6);
  }

  onMount(() => {
    authStore.bootstrap();
  });

  $effect(() => {
    if (passwordInput) {
      passwordStrength = authStore.calculatePasswordStrength(passwordInput);
    } else {
      passwordStrength = { score: 0, feedback: [] };
    }
  });

  $effect(() => {
    const onboarding = $authStore.onboarding;

    if (onboarding) {
      QRCode.toDataURL(onboarding.totpUri, { scale: 5, margin: 1 })
        .then((url) => {
          totpQr = url;
        })
        .catch((error) => console.error("Failed to generate TOTP QR:", error));
    } else {
      username = "";
      totpQr = null;
      confirmationInputs = {};
      totpCode = "";
      passwordInput = "";
      passwordConfirm = "";
      onboardingStep = "username";
    }
  });

  let lastAuthError: string | null = null;
  $effect(() => {
    const error = $authStore.error;
    if (error && error !== lastAuthError) {
      toasts.showErrorToast(error);
    }
    lastAuthError = error;
  });

  let lastDeviceLoginIssuedAt: number | null = null;
  $effect(() => {
    const pendingDevice = $authStore.pendingDeviceLogin;
    if (pendingDevice) {
      if (pendingDevice.issuedAt !== lastDeviceLoginIssuedAt) {
        const label = pendingDevice.username ?? "trusted device";
        toasts.addToast(`Login request from ${label}.`, "info");
        lastDeviceLoginIssuedAt = pendingDevice.issuedAt;
      }
    } else {
      lastDeviceLoginIssuedAt = null;
    }
  });

  let lastRecoveryRotationId: string | null = null;
  $effect(() => {
    const pending = $authStore.pendingRecoveryRotation;
    const currentStatus = $authStore.status;
    if (currentStatus === "recovery_ack_required" && pending) {
      if (pending.initiatedAt !== lastRecoveryRotationId) {
        toasts.addToast(
          "Your previous recovery phrase is no longer valid. Store the new phrase before continuing.",
          "warning",
          6000,
        );
        lastRecoveryRotationId = pending.initiatedAt;
      }
    } else {
      lastRecoveryRotationId = null;
    }
  });

  const confirmReady = $derived(
    (() => {
      const onboarding = $authStore.onboarding;

      if (!onboarding) return false;

      return onboarding.confirmationIndices.every(
        (index) => (confirmationInputs[index] ?? "").trim().length > 0,
      );
    })(),
  );

  const securityQuestionsReady = $derived(
    securityQuestions.length >= 3 &&
      securityQuestions.every(
        (q) => q.question.trim().length > 0 && q.answer.trim().length >= 3,
      ),
  );

  const predefinedQuestions = [
    "What was your childhood nickname?",
    "What is your mother's maiden name?",
    "What was the name of your first pet?",
    "What city were you born in?",
    "What was your first school called?",
    "What is your favorite childhood memory?",
    "What was the make and model of your first car?",
    "What is the name of your favorite childhood teacher?",
  ];

  async function handleStartOnboarding(event: Event) {
    event.preventDefault();
    try {
      authStore.clearError();
      authStore.beginOnboarding(username);
      onboardingStep = "phrase";
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to start setup.";
      toasts.showErrorToast(message);
    }
  }

  async function handleSecurityQuestionRecovery(event: Event) {
    event.preventDefault();
    authStore.clearError();
    const questions = storedSecurityQuestions;

    if (questions.length === 0) {
      toasts.showErrorToast(
        "Security questions are not configured for this identity.",
      );
      return;
    }

    const normalizedAnswers = questions.reduce<Record<string, string>>(
      (acc, item) => {
        const response = securityQuestionAnswers[item.question];

        if (response?.trim()) {
          acc[item.question] = response.trim().toLowerCase();
        }

        return acc;
      },
      {},
    );

    if (Object.keys(normalizedAnswers).length < 2) {
      toasts.showErrorToast("Answer at least two security questions.");
      return;
    }

    if (!recoveryPassword || !recoveryPasswordConfirm) {
      toasts.showErrorToast(
        "Enter and confirm your new password to continue.",
      );
      return;
    }

    if (recoveryPassword !== recoveryPasswordConfirm) {
      toasts.showErrorToast("Passwords must match.");
      return;
    }

    const validation = validatePassword(
      recoveryPassword,
      unicodeRequired,
      true,
    );

    if (validation) {
      toasts.showErrorToast(validation);
      return;
    }

    if (requireTotpOnUnlock && recoveryTotp.length !== 6) {
      toasts.showErrorToast("Authenticator code must be 6 digits.");
      return;
    }

    try {
      await authStore.loginWithSecurityQuestions({
        answers: normalizedAnswers,
        newPassword: recoveryPassword,
        totpCode: requireTotpOnUnlock ? recoveryTotp : undefined,
      });

      closeRecoveryForm();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Security question recovery failed.";
      toasts.showErrorToast(message);
    }
  }

  function goToConfirmation() {
    onboardingStep = "confirm";
  }

  function goToPasswordStep(event: Event) {
    event.preventDefault();
    onboardingStep = "password";
  }

  async function handleSavePassword(event: Event) {
    event.preventDefault();
    authStore.clearError();

    if (passwordInput !== passwordConfirm) {
      toasts.showErrorToast("Passwords do not match.");
      return;
    }

    const validation = validatePassword(passwordInput, unicodeRequired);

    if (validation) {
      toasts.showErrorToast(validation);
      return;
    }

    try {
      authStore.saveOnboardingPassword(passwordInput);
      onboardingStep = "security_questions";
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to accept password.";
      toasts.showErrorToast(message);
    }
  }

  async function handleSecurityQuestions(event: Event) {
    event.preventDefault();
    authStore.clearError();

    try {
      const normalizedQuestions = securityQuestions.map((item) => ({
        question: item.question.trim(),
        answerHash: item.answer.trim().toLowerCase(),
      }));

      await authStore.configureSecurityQuestions(normalizedQuestions);

      onboardingStep = "backup_codes";
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to configure security questions.";
      toasts.showErrorToast(message);
    }
  }

  async function finishOnboarding(event: Event) {
    event.preventDefault();
    if (!$authStore.onboarding) return;

    try {
      await authStore.completeOnboarding({
        confirmations: confirmationInputs,
        totpCode,
      });

      backupCodes = authStore.getPersistence()?.backupCodes ?? [];
      onboardingStep = "backup_codes";
    } catch {
      // handled by store
    }
  }

  function addSecurityQuestion() {
    if (securityQuestions.length < 5) {
      securityQuestions = [...securityQuestions, { question: "", answer: "" }];
    }
  }

  function removeSecurityQuestion(index: number) {
    securityQuestions = securityQuestions.filter((_, i) => i !== index);
  }

  function togglePasswordVisibility() {
    showPassword = !showPassword;
  }

  async function handleUnlock(event: Event) {
    event.preventDefault();
    if (unlockPending) return;

    unlockPasswordError = null;
    unlockPending = true;

    try {
      await authStore.loginWithPassword(
        unlockPassword,
        requireTotpOnUnlock ? unlockTotp : undefined,
      );
    } catch (error) {
      unlockPasswordError =
        error instanceof Error ? error.message : "Unable to unlock.";
    } finally {
      unlockPending = false;
    }
  }

  async function handleRecoveryLogin(event: Event) {
    event.preventDefault();

    if (recoveryPassword !== recoveryPasswordConfirm) {
      toasts.showErrorToast("Passwords do not match.");
      return;
    }

    const validation = validatePassword(
      recoveryPassword,
      unicodeRequired,
      true,
    );

    if (validation) {
      toasts.showErrorToast(validation);
      return;
    }

    try {
      await authStore.loginWithRecovery({
        phrase: recoveryPhrase,
        newPassword: recoveryPassword,
        totpCode: requireTotpOnUnlock ? recoveryTotp : undefined,
      });
      securityQuestionAnswers = {};
      recoveryPhrase = "";
      recoveryTotp = "";
      recoveryPassword = "";
      recoveryPasswordConfirm = "";
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Recovery failed.";
      toasts.showErrorToast(message);
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
      const message =
        error instanceof Error
          ? error.message
          : "Failed to process QR code.";
      toasts.showErrorToast(message);
    }
  }

  function handleScannerError() {
    toasts.showErrorToast("Camera error: unable to start QR scanner.");
  }

  function resetRecoveryFormFields() {
    securityQuestionAnswers = {};
    recoveryPhrase = "";
    recoveryTotp = "";
    recoveryPassword = "";
    recoveryPasswordConfirm = "";
  }

  function switchView(view: SupportView) {
    if (view !== "recovery") {
      resetRecoveryFormFields();
      showRecoveryForm = false;
    }
    activeView = view;
  }

  function openRecoveryForm() {
    resetRecoveryFormFields();
    switchView("recovery");
    showRecoveryForm = true;
    if (recoveryQuestionPrompts.length === 0) {
      toasts.addToast(
        "Add security questions from Settings before using this recovery method.",
        "warning",
      );
    }
  }

  function closeRecoveryForm() {
    resetRecoveryFormFields();
    showRecoveryForm = false;
  }

  async function finalizeSecurityQuestionRecovery() {
    try {
      await authStore.completeSecurityQuestionRecovery();
      securityQuestionAnswers = {};
      recoveryPassword = "";
      recoveryPasswordConfirm = "";
      recoveryTotp = "";
      showRecoveryForm = false;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to finalize recovery.";
      toasts.showErrorToast(message);
    }
  }

  function resetUnlockState() {
    unlockPassword = "";
    unlockTotp = "";
    unlockPasswordError = null;
    unlockPending = false;
  }

  function handleLogout() {
    resetUnlockState();
    authStore.logout();
    activeView = "unlock";
  }

  function handleSwitchAccount() {
    resetUnlockState();
    authStore.cancelOnboarding();
    authStore.logout();
    activeView = "unlock";
  }

  function startFreshRegistration() {
    resetUnlockState();
    resetRecoveryFormFields();
    showScanner = false;
    authStore.clearError();
    authStore.cancelOnboarding();
    onboardingStep = "username";
    confirmationInputs = {};
    totpCode = "";
    passwordInput = "";
    passwordConfirm = "";
    securityQuestions = [];
    backupCodes = [];
    showRecoveryForm = false;
    activeView = "unlock";
  }

  const isLoading = $derived($authStore.loading);
  const status = $derived($authStore.status);
  const pendingRecovery = $derived($authStore.pendingRecoveryRotation);
  const inOnboardingFlow = $derived(
    status === "needs_setup" || status === "setup_in_progress",
  );

  const hasStoredSecurityQuestions = $derived(
    storedSecurityQuestions.length > 0,
  );

  const storedUsername = $derived($authPersistenceStore.username ?? null);
  const hasStoredCredentials = $derived(
    Boolean($authPersistenceStore.passwordHash && storedUsername),
  );

  const identityLabel = $derived(
    storedUsername ?? (username.trim().length ? username.trim() : "New identity"),
  );

  const canSubmitPassword = $derived(
    passwordInput === passwordConfirm &&
      !validatePassword(passwordInput, unicodeRequired),
  );

  $effect(() => {
    if (!showRecoveryForm) return;
    const prompts = new Set<string>(recoveryQuestionPrompts);
    const filteredEntries = Object.entries(securityQuestionAnswers).filter(
      ([question]) => prompts.has(question),
    );

    if (
      filteredEntries.length !== Object.keys(securityQuestionAnswers).length
    ) {
      securityQuestionAnswers = Object.fromEntries(filteredEntries) as Record<
        string,
        string
      >;
    }
  });

  const showRecoveryTab = $derived(hasStoredSecurityQuestions || pendingRecovery);

  const onboardingStages = [
    { id: "username", label: "Callsign" },
    { id: "phrase", label: "Recovery phrase" },
    { id: "confirm", label: "Phrase check" },
    { id: "password", label: "Unlock password" },
    { id: "security_questions", label: "Security questions" },
    { id: "backup_codes", label: "Backup codes" },
    { id: "totp", label: "Authenticator" },
  ] satisfies { id: OnboardingStep; label: string }[];

  const onboardingStepIndex = $derived(
    Math.max(
      0,
      onboardingStages.findIndex((stage) => stage.id === onboardingStep),
    ),
  );

  const onboardingProgress = $derived(
    ((onboardingStepIndex + 1) / onboardingStages.length) * 100,
  );

  $effect(() => {
    if (inOnboardingFlow) {
      activeView = "unlock";
    }
  });

  $effect(() => {
    if (
      !inOnboardingFlow &&
      (status === "recovery_ack_required" || pendingRecovery)
    ) {
      activeView = "recovery";
    }
  });
</script>
<div
  class="min-h-screen w-full bg-linear-to-br from-zinc-950 via-zinc-900 to-black text-zinc-100 flex items-center justify-center px-6 py-12"
>
  <Dialog open={showScanner} onOpenChange={(value) => (showScanner = value)}>
    <DialogContent class="max-w-lg border border-zinc-800 bg-zinc-950/95">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 text-zinc-100">
          <Scan size={18} /> Scan trusted device
        </DialogTitle>

        <DialogDescription class="text-zinc-400">
          Point your camera at the login QR displayed on one of your trusted
          devices.
        </DialogDescription>
      </DialogHeader>

      <RecoveryQrScanner
        on:result={(event) => handleScan(event.detail)}
        on:error={handleScannerError}
      />

      <DialogFooter class="sm:justify-end">
        <Button variant="ghost" size="sm" onclick={() => (showScanner = false)}>
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog
    open={status === "recovery_ack_required" && !!pendingRecovery}
    onOpenChange={() => undefined}
  >
    <DialogContent class="max-w-2xl border border-zinc-800 bg-zinc-950/95">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 text-zinc-100">
          <Save size={18} /> Confirm your new recovery phrase
        </DialogTitle>

        <DialogDescription class="text-zinc-400">
          We generated a new recovery phrase for you. Store it securely before
          finishing your password reset.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div class="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-100">
          <TriangleAlert size={18} class="mt-0.5 text-yellow-300" />
          <div class="space-y-1">
            <p class="font-medium text-yellow-200">Save these words now</p>
            <p class="text-sm text-yellow-100/80">
              Your previous recovery phrase is no longer valid. Write this one
              down before you continue.
            </p>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm font-mono">
          {#each pendingRecovery?.newRecoveryPhrase ?? [] as word, index (index)}
            <div
              class="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-zinc-200"
            >
              <span class="text-xs text-zinc-500 mr-2">{index + 1}.</span>{word}
            </div>
          {/each}
        </div>
      </div>

      <DialogFooter>
        <Button
          class="w-full"
          onclick={finalizeSecurityQuestionRecovery}
          disabled={isLoading}
        >
          I have stored my new recovery phrase
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <section class="w-full max-w-5xl space-y-8">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3">
        <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900/60 ring-1 ring-zinc-800 shadow-lg shadow-black/40">
          <Lock class="h-5 w-5 text-primary" />
        </div>

        <div class="space-y-1">
          <h1 class="text-xl font-semibold tracking-tight">Aegis unlock</h1>

          <p class="text-sm text-zinc-400">
            {#if status === "needs_setup"}
              Create a new secure identity.
            {:else}
              Continue as <span class="text-zinc-200 font-medium">{identityLabel}</span>.
            {/if}

            {#if requireTotpOnUnlock}
              <span class="ml-2 inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-zinc-300 ring-1 ring-zinc-800">
                <Shield size={12} /> 2FA
              </span>
            {/if}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        {#if hasStoredCredentials}
          <Button variant="outline" size="sm" onclick={handleSwitchAccount}>
            <ArrowLeftRight size={14} /> Switch account
          </Button>
        {/if}

        <Button variant="ghost" size="sm" onclick={handleLogout}>
          <LogOut size={16} /> Log out
        </Button>
      </div>
    </header>

    {#if inOnboardingFlow}
      <section class="rounded-2xl border border-zinc-800/70 bg-black/45 p-6 shadow-lg shadow-black/30 backdrop-blur space-y-6">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-xs uppercase tracking-widest text-zinc-500">Initial setup</p>
            <h2 class="text-2xl font-semibold text-zinc-100">Secure your identity</h2>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            {#if hasStoredCredentials}
              <Button variant="outline" size="sm" onclick={handleSwitchAccount}>
                <ArrowLeftRight size={14} /> Use another account
              </Button>
            {/if}

            <Button variant="ghost" size="sm" onclick={handleLogout}>
              Cancel setup
            </Button>
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs text-zinc-500">
            <span>Step {onboardingStepIndex + 1} of {onboardingStages.length}</span>
            <span class="uppercase tracking-wide text-zinc-400">
              {onboardingStages[onboardingStepIndex]?.label}
            </span>
          </div>

          <Progress value={onboardingProgress} class="h-1 bg-zinc-800" />
        </div>
        {#if onboardingStep === "username"}
          <form class="space-y-5" onsubmit={handleStartOnboarding}>
            <div class="space-y-2">
              <Label for="callsign">Choose a callsign</Label>

              <Input
                id="callsign"
                type="text"
                placeholder="e.g. SentinelFox"
                class="h-11"
                bind:value={username}
                minlength={3}
                required
                disabled={isLoading}
              />

              <p class="text-xs text-zinc-500">
                Your callsign appears to contacts and trusted devices.
              </p>
            </div>

            <Button
              class="w-full sm:w-auto"
              type="submit"
              disabled={isLoading || username.trim().length < 3}
            >
              <ShieldCheck size={16} /> Start guided setup
            </Button>
          </form>
        {:else if onboardingStep === "phrase" && $authStore.onboarding}
          <div class="space-y-4">
            <h3 class="text-lg font-semibold flex items-center gap-2">
              <Save size={18} /> Write down your recovery phrase
            </h3>

            <p class="text-sm text-zinc-400">
              Copy these 12 words in order. They are the only way to rebuild your identity if you forget your password.
            </p>

            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm font-mono">
              {#each $authStore.onboarding.recoveryPhrase as word, index (index)}
                <div class="rounded-lg border border-zinc-800/70 bg-zinc-950/70 px-3 py-2 text-zinc-100">
                  <span class="text-xs text-zinc-500 mr-2">{index + 1}.</span>{word}
                </div>
              {/each}
            </div>

            <Button class="w-full sm:w-auto" onclick={goToConfirmation}>
              I have stored my recovery phrase
            </Button>
          </div>
        {:else if onboardingStep === "confirm" && $authStore.onboarding}
          <form class="space-y-5" onsubmit={goToPasswordStep}>
            <h3 class="text-lg font-semibold flex items-center gap-2">
              <Save size={18} /> Confirm two random words
            </h3>

            <div class="grid gap-4 sm:grid-cols-2">
              {#each $authStore.onboarding.confirmationIndices as index (index)}
                <div class="space-y-2">
                  <Label for={`word-${index}`}>Word #{index + 1}</Label>

                  <Input
                    id={`word-${index}`}
                    type="text"
                    class="h-10"
                    value={confirmationInputs[index] ?? ""}
                    oninput={(e) => {
                      const t = e.currentTarget as HTMLInputElement;

                      confirmationInputs = {
                        ...confirmationInputs,
                        [index]: t.value,
                      };
                    }}
                    required
                    disabled={isLoading}
                  />
                </div>
              {/each}
            </div>

            <Button
              class="w-full sm:w-auto"
              type="submit"
              disabled={!confirmReady || isLoading}
            >
              Continue to password setup
            </Button>
          </form>
        {:else if onboardingStep === "password"}
          <form class="space-y-5" onsubmit={handleSavePassword}>
            <h3 class="text-lg font-semibold flex items-center gap-2">
              <KeySquare size={18} /> Create your unlock password
            </h3>

            <p class="text-sm text-zinc-400">
              {#if unicodeRequired}
                Use at least 12 characters including uppercase, lowercase, numbers, special characters, and a Unicode character.
              {:else}
                Use at least 12 characters with mixed case, numbers, and symbols.
              {/if}
            </p>

            {#if passwordInput}
              <div class="space-y-2">
                <div class="flex items-center justify-between text-xs uppercase tracking-wide">
                  <span class="text-zinc-500">Strength</span>
                  <span
                    class="font-semibold"
                    class:text-red-400={passwordStrength.score < 40}
                    class:text-yellow-400={passwordStrength.score >= 40 && passwordStrength.score < 80}
                    class:text-emerald-400={passwordStrength.score >= 80}
                  >
                    {passwordStrength.score < 40
                      ? "Weak"
                      : passwordStrength.score < 80
                        ? "Medium"
                        : "Strong"}
                  </span>
                </div>

                <Progress value={passwordStrength.score} max={100} class="h-2 bg-zinc-800" />

                {#if passwordStrength.feedback.length > 0}
                  <ul class="text-xs text-zinc-500 space-y-1">
                    {#each passwordStrength.feedback as feedback}
                      <li>{feedback}</li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}

            <div class="space-y-2">
              <Label for="password">Password</Label>

              <div class="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  bind:value={passwordInput}
                  autocomplete="new-password"
                  minlength={MIN_PASSWORD_LENGTH}
                />

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  class="absolute right-2 top-1/2 -translate-y-1/2"
                  onclick={togglePasswordVisibility}
                >
                  {#if showPassword}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
                </Button>
              </div>
            </div>

            <div class="space-y-2">
              <Label for="password-confirm">Confirm password</Label>

              <Input
                id="password-confirm"
                type="password"
                value={passwordConfirm}
                oninput={(e) => {
                  const t = e.currentTarget as HTMLInputElement;
                  passwordConfirm = t.value;
                }}
                minlength={MIN_PASSWORD_LENGTH}
                autocomplete="new-password"
                required
              />
            </div>
            <Button
              class="w-full sm:w-auto"
              type="submit"
              disabled={isLoading || !canSubmitPassword}
            >
              Continue to security setup
            </Button>
          </form>
        {:else if onboardingStep === "security_questions"}
          <form class="space-y-5" onsubmit={handleSecurityQuestions}>
            <h3 class="text-lg font-semibold flex items-center gap-2">
              <Shield size={18} /> Configure security questions
            </h3>

            <p class="text-sm text-zinc-400">
              Choose 3–5 questions only you can answer. These protect you during recovery.
            </p>

            <div class="space-y-4">
              {#each securityQuestions as question, index}
                <div class="space-y-3 rounded-xl border border-zinc-800/70 bg-zinc-950/60 p-4">
                  <div class="flex items-center justify-between">
                    <Label for={`question-${index}`}>Question {index + 1}</Label>

                    {#if securityQuestions.length > 3}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        class="text-red-400 hover:text-destructive"
                        onclick={() => removeSecurityQuestion(index)}
                      >
                        Remove
                      </Button>
                    {/if}
                  </div>

                  <Select type="single" bind:value={question.question}>
                    <SelectTrigger placeholder="Choose a question…" />

                    <SelectContent>
                      {#each predefinedQuestions as q}
                        <SelectItem value={q}>{q}</SelectItem>
                      {/each}
                    </SelectContent>
                  </Select>

                  <Input
                    id={`question-${index}`}
                    type="text"
                    placeholder="Your answer"
                    bind:value={question.answer}
                    minlength={3}
                    required
                  />
                </div>
              {/each}
            </div>

            {#if securityQuestions.length < 5}
              <Button
                type="button"
                variant="outline"
                class="w-full sm:w-auto"
                onclick={addSecurityQuestion}
              >
                Add another question
              </Button>
            {/if}

            <Button
              class="w-full sm:w-auto"
              type="submit"
              disabled={!securityQuestionsReady || isLoading}
            >
              Continue to backup codes
            </Button>
          </form>
        {:else if onboardingStep === "backup_codes" && backupCodes.length > 0}
          <div class="space-y-5">
            <h3 class="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck size={18} /> Save your backup codes
            </h3>

            <p class="text-sm text-zinc-400">
              Each code works once. Store them offline before continuing.
            </p>

            <div class="rounded-xl border border-zinc-800/70 bg-zinc-950/60 p-4">
              <div class="grid grid-cols-2 gap-2 text-sm font-mono">
                {#each backupCodes as code}
                  <span class="rounded-md bg-zinc-900/70 px-3 py-2 text-center text-zinc-100">
                    {code}
                  </span>
                {/each}
              </div>
            </div>

            <Button class="w-full sm:w-auto" onclick={() => (onboardingStep = "totp")}>
              I have saved my backup codes
            </Button>
          </div>
        {:else if onboardingStep === "totp" && $authStore.onboarding}
          <form class="space-y-5" onsubmit={finishOnboarding}>
            <h3 class="text-lg font-semibold flex items-center gap-2">
              <KeyRound size={18} /> Pair your authenticator
            </h3>

            <div class="grid gap-4 lg:grid-cols-[auto,1fr]">
              {#if totpQr}
                <img
                  src={totpQr}
                  alt="Authenticator QR"
                  class="h-40 w-40 rounded-xl border border-zinc-800 bg-white p-2"
                />
              {/if}

              <div class="space-y-3 text-sm">
                <p class="text-zinc-400">
                  Scan with your authenticator app or enter the key manually.
                </p>

                <div class="rounded-lg border border-zinc-800/70 bg-zinc-950/50 p-3">
                  <p class="text-xs uppercase text-zinc-500">Manual key</p>
                  <Input value={$authStore.onboarding.totpSecret} readonly class="font-mono text-base" />
                </div>
              </div>
            </div>

            <div class="space-y-2">
              <Label for="totp-setup">Authenticator code</Label>

              <Input
                id="totp-setup"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                value={totpCode}
                oninput={(e) => {
                  const t = e.currentTarget as HTMLInputElement;
                  totpCode = sanitizeCode(t.value);
                }}
                maxlength={6}
                required
                disabled={isLoading}
              />
            </div>

            <Button
              class="w-full sm:w-auto"
              type="submit"
              disabled={totpCode.length !== 6 || isLoading}
            >
              Complete onboarding
            </Button>
          </form>
        {/if}
      </section>
    {:else}
      <section class="rounded-2xl border border-zinc-800/70 bg-black/45 p-6 shadow-lg shadow-black/30 backdrop-blur space-y-6">
        {#if activeView === "unlock"}
          <div class="space-y-6">
            <form class="space-y-4" onsubmit={handleUnlock}>
              <div class="space-y-2">
                <Label for="unlock-password">Unlock password</Label>

                <Input
                  id="unlock-password"
                  type="password"
                  value={unlockPassword}
                  oninput={(e) => {
                    const t = e.currentTarget as HTMLInputElement;
                    unlockPassword = t.value;
                  }}
                  autocomplete="current-password"
                  required
                />
              </div>

              {#if requireTotpOnUnlock}
                <div class="space-y-2">
                  <Label for="unlock-totp">Authenticator code</Label>

                  <Input
                    id="unlock-totp"
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    value={unlockTotp}
                    oninput={(event) => {
                      const target = event.currentTarget as HTMLInputElement;
                      unlockTotp = sanitizeCode(target.value);
                    }}
                    maxlength={6}
                    required
                  />
                </div>
              {/if}

              {#if unlockPasswordError}
                <p class="text-sm text-red-400">{unlockPasswordError}</p>
              {/if}

              <Button
                class="w-full sm:w-auto"
                type="submit"
                disabled={unlockPending ||
                  unlockPassword.trim().length === 0 ||
                  (requireTotpOnUnlock && unlockTotp.length !== 6)}
              >
                Unlock session
              </Button>
            </form>

            {#if status === "account_locked"}
              <div class="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                <div class="flex items-center gap-2 font-medium">
                  <Shield size={14} /> Account locked
                </div>
                <p class="mt-1 text-red-200/80">
                  Too many failed attempts. Try again later.
                  {#if $authStore.accountLockedUntil}
                    Unlocks at {$authStore.accountLockedUntil.toLocaleTimeString()}.
                  {/if}
                </p>
              </div>
            {/if}

            <div class="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                class="flex items-center gap-2"
                onclick={startFreshRegistration}
              >
                <UserPlus size={14} /> Register new identity
              </Button>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                class="flex items-center gap-2"
                onclick={() => switchView("recovery")}
                disabled={!showRecoveryTab}
              >
                <Shield size={14} /> Use recovery options
              </Button>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                class="flex items-center gap-2"
                onclick={() => switchView("handoff")}
              >
                <QrCode size={14} /> Scan trusted device
              </Button>
            </div>
          </div>
        {:else if activeView === "recovery"}
          <div class="space-y-6">
            {#if !showRecoveryForm}
              <div class="rounded-2xl border border-zinc-800/70 bg-zinc-950/40 p-5">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <h3 class="text-lg font-semibold text-zinc-100">Security question recovery</h3>
                    <p class="text-sm text-zinc-400">
                      Answer at least two security questions to set a new password.
                    </p>
                  </div>

                  <Button
                    class="shrink-0"
                    variant="outline"
                    size="sm"
                    type="button"
                    onclick={openRecoveryForm}
                    disabled={status === "recovery_ack_required"}
                  >
                    Begin recovery
                  </Button>
                </div>
              </div>
            {:else}
              <form class="space-y-4" onsubmit={handleSecurityQuestionRecovery}>
                {#if recoveryQuestionPrompts.length === 0}
                  <div class="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                    Add security questions from Settings before using this recovery method.
                  </div>
                {:else}
                  <div class="space-y-4">
                    {#each recoveryQuestionPrompts as prompt, index (prompt)}
                      <div class="space-y-2">
                        <Label for={`recovery-question-${index}`}>{prompt}</Label>

                        <Input
                          id={`recovery-question-${index}`}
                          type="text"
                          value={securityQuestionAnswers[prompt] ?? ""}
                          oninput={(event) => {
                            const target = event.currentTarget as HTMLInputElement;
                            securityQuestionAnswers = {
                              ...securityQuestionAnswers,
                              [prompt]: target.value,
                            };
                          }}
                          autocomplete="off"
                        />
                      </div>
                    {/each}

                    <p class="text-xs text-zinc-500">
                      Provide answers for at least two questions to continue.
                    </p>
                  </div>
                {/if}

                {#if requireTotpOnUnlock}
                  <div class="space-y-2">
                    <Label for="recovery-totp">Authenticator code</Label>

                    <Input
                      id="recovery-totp"
                      type="text"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      value={recoveryTotp}
                      oninput={(event) => {
                        const target = event.currentTarget as HTMLInputElement;
                        recoveryTotp = sanitizeCode(target.value);
                      }}
                      maxlength={6}
                      required
                    />
                  </div>
                {/if}

                <div class="space-y-2">
                  <Label for="recovery-password">New password</Label>

                  <Input
                    id="recovery-password"
                    type="password"
                    value={recoveryPassword}
                    oninput={(e) => {
                      const t = e.currentTarget as HTMLInputElement;
                      recoveryPassword = t.value;
                    }}
                    minlength={MIN_PASSWORD_LENGTH}
                    autocomplete="new-password"
                    required
                  />

                  {#if recoveryPasswordValidation && recoveryPassword}
                    <p class="text-xs text-red-400">{recoveryPasswordValidation}</p>
                  {/if}
                </div>

                <div class="space-y-2">
                  <Label for="recovery-password-confirm">Confirm new password</Label>

                  <Input
                    id="recovery-password-confirm"
                    type="password"
                    value={recoveryPasswordConfirm}
                    oninput={(e) => {
                      const t = e.currentTarget as HTMLInputElement;
                      recoveryPasswordConfirm = t.value;
                    }}
                    minlength={MIN_PASSWORD_LENGTH}
                    autocomplete="new-password"
                    required
                  />

                  {#if recoveryPassword && recoveryPasswordConfirm && recoveryPassword !== recoveryPasswordConfirm}
                    <p class="text-xs text-red-400">Passwords must match.</p>
                  {/if}
                </div>
                <div class="flex flex-col gap-3 sm:flex-row">
                  <Button
                    class="w-full"
                    type="submit"
                    disabled={!recoveryFormReady || isLoading || status === "recovery_ack_required"}
                  >
                    Reset password
                  </Button>

                  <Button
                    class="w-full sm:w-auto"
                    variant="ghost"
                    type="button"
                    onclick={closeRecoveryForm}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            {/if}
          </div>
        {:else}
          <div class="space-y-6">
            {#if $authStore.pendingDeviceLogin}
              <div class="rounded-lg border border-blue-500/40 bg-blue-500/10 p-4 text-sm text-zinc-200">
                <p class="font-medium text-zinc-100">Login request</p>
                <p class="mt-1 text-zinc-300/80">
                  Login request from {$authStore.pendingDeviceLogin.username ?? "trusted device"}.
                </p>
              </div>

              <form class="space-y-3" onsubmit={handleDeviceLogin}>
                <div class="space-y-2">
                  <Label for="device-approve-totp">Authenticator code</Label>
                  <Input
                    id="device-approve-totp"
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
                    disabled={isLoading}
                  />
                </div>

                <Button
                  class="w-full sm:w-auto"
                  type="submit"
                  disabled={deviceTotp.length !== 6 || isLoading}
                >
                  Approve login
                </Button>
              </form>
            {:else}
              <div class="rounded-2xl border border-zinc-800/70 bg-zinc-950/40 p-5 text-sm text-zinc-400">
                <p>
                  Generate a QR from another trusted device to hand off your session instantly.
                </p>

                <Button
                  class="mt-4 w-full sm:w-auto"
                  variant="outline"
                  onclick={() => {
                    authStore.clearError();
                    showScanner = true;
                  }}
                >
                  Launch camera scanner
                </Button>
              </div>
            {/if}
          </div>
        {/if}
      </section>
    {/if}
  </section>
</div>

