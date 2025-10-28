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
  } from "@lucide/svelte";
  import {
    authStore,
    authPersistenceStore,
    MIN_PASSWORD_LENGTH,
    validatePassword,
  } from "$lib/features/auth/stores/authStore";
  import type { SecurityQuestion } from "$lib/features/auth/stores/authStore";
  import RecoveryQrScanner from "./RecoveryQrScanner.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import {
    Alert,
    AlertTitle,
    AlertDescription,
  } from "$lib/components/ui/alert/index.js";
  import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
  } from "$lib/components/ui/select/index.js";
  import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
  } from "$lib/components/ui/card/index.js";
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
  import { Badge } from "$lib/components/ui/badge/index.js";

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
  let passwordError = $state<string | null>(null);
  let unlockPassword = $state("");
  let unlockPasswordError = $state<string | null>(null);
  let unlockTotp = $state("");
  let securityQuestionAnswers = $state<Record<string, string>>({});
  let recoveryPhrase = $state("");
  let recoveryTotp = $state("");
  let recoveryPassword = $state("");
  let recoveryPasswordConfirm = $state("");
  let recoveryError = $state<string | null>(null);
  let pendingRecoveryError = $state<string | null>(null);
  let deviceTotp = $state("");
  let showScanner = $state(false);
  let totpQr = $state<string | null>(null);
  let localError = $state<string | null>(null);

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
      passwordError = null;
      onboardingStep = "username";
    }
  });

  $effect(() => {
    if ($authStore.error) {
      localError = $authStore.error;
    } else {
      localError = null;
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
      localError =
        error instanceof Error ? error.message : "Unable to start setup.";
    }
  }

  async function handleSecurityQuestionRecovery(event: Event) {
    event.preventDefault();
    recoveryError = null;
    authStore.clearError();
    const questions = storedSecurityQuestions;

    if (questions.length === 0) {
      recoveryError =
        "Security questions are not configured for this identity.";
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
      recoveryError = "Answer at least two security questions.";
      return;
    }

    if (!recoveryPassword || !recoveryPasswordConfirm) {
      recoveryError = "Enter and confirm your new password to continue.";
      return;
    }

    if (recoveryPassword !== recoveryPasswordConfirm) {
      recoveryError = "Passwords must match.";
      return;
    }

    const validation = validatePassword(
      recoveryPassword,
      unicodeRequired,
      true,
    );

    if (validation) {
      recoveryError = validation;
      return;
    }

    if (requireTotpOnUnlock && recoveryTotp.length !== 6) {
      recoveryError = "Authenticator code must be 6 digits.";
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
      recoveryError =
        error instanceof Error
          ? error.message
          : "Security question recovery failed.";
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
    passwordError = null;

    if (passwordInput !== passwordConfirm) {
      passwordError = "Passwords do not match.";
      return;
    }

    const validation = validatePassword(passwordInput, unicodeRequired);

    if (validation) {
      passwordError = validation;
      return;
    }

    try {
      authStore.saveOnboardingPassword(passwordInput);
      onboardingStep = "security_questions";
    } catch (error) {
      passwordError =
        error instanceof Error ? error.message : "Unable to accept password.";
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
      localError =
        error instanceof Error
          ? error.message
          : "Failed to configure security questions.";
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

    unlockPasswordError = null;

    try {
      await authStore.loginWithPassword(
        unlockPassword,
        requireTotpOnUnlock ? unlockTotp : undefined,
      );
    } catch (error) {
      unlockPasswordError =
        error instanceof Error ? error.message : "Unable to unlock.";
    }
  }

  async function handleRecoveryLogin(event: Event) {
    event.preventDefault();
    recoveryError = null;

    if (recoveryPassword !== recoveryPasswordConfirm) {
      recoveryError = "Passwords do not match.";
      return;
    }

    const validation = validatePassword(
      recoveryPassword,
      unicodeRequired,
      true,
    );

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
      securityQuestionAnswers = {};
      recoveryPhrase = "";
      recoveryTotp = "";
      recoveryPassword = "";
      recoveryPasswordConfirm = "";
    } catch (error) {
      recoveryError =
        error instanceof Error ? error.message : "Recovery failed.";
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
      localError =
        error instanceof Error ? error.message : "Failed to process QR code.";
    }
  }

  function handleScannerError() {
    localError = "Camera error: unable to start QR scanner.";
  }

  function resetRecoveryFormFields() {
    securityQuestionAnswers = {};
    recoveryPhrase = "";
    recoveryTotp = "";
    recoveryPassword = "";
    recoveryPasswordConfirm = "";
    recoveryError = null;
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
  }

  function closeRecoveryForm() {
    resetRecoveryFormFields();
    showRecoveryForm = false;
  }

  async function finalizeSecurityQuestionRecovery() {
    pendingRecoveryError = null;
    try {
      await authStore.completeSecurityQuestionRecovery();
      securityQuestionAnswers = {};
      recoveryPassword = "";
      recoveryPasswordConfirm = "";
      recoveryTotp = "";
      showRecoveryForm = false;
    } catch (error) {
      pendingRecoveryError =
        error instanceof Error ? error.message : "Unable to finalize recovery.";
    }
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

  $effect(() => {
    if (status !== "recovery_ack_required") {
      pendingRecoveryError = null;
    }
  });

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
  class="min-h-screen w-full bg-zinc-950 text-zinc-100 flex items-center justify-center px-6 py-10 relative"
>
  <Dialog open={showScanner} onOpenChange={(value) => (showScanner = value)}>
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Scan size={18} /> Scan Trusted Device
        </DialogTitle>

        <DialogDescription>
          Point your camera at the login QR displayed on one of your trusted
          devices.
        </DialogDescription>
      </DialogHeader>

      <RecoveryQrScanner
        on:result={(event) => handleScan(event.detail)}
        on:error={handleScannerError}
      />

      <DialogFooter>
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
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Save size={18} /> Confirm your new recovery phrase
        </DialogTitle>

        <DialogDescription>
          We generated a new recovery phrase for you. Store it securely before
          finishing your password reset.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <Alert class="border-yellow-500/30 bg-yellow-500/10 text-yellow-100">
          <AlertTitle class="flex items-center gap-2 text-yellow-100">
            <TriangleAlert size={16} class="text-yellow-300" />

            Save these words now
          </AlertTitle>

          <AlertDescription class="text-yellow-100/80">
            Your previous recovery phrase is no longer valid. Write this one
            down before you continue.
          </AlertDescription>
        </Alert>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm font-mono">
          {#each pendingRecovery?.newRecoveryPhrase ?? [] as word, index (index)}
            <div
              class="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200"
            >
              <span class="text-xs text-zinc-500 mr-2">{index + 1}.</span>{word}
            </div>
          {/each}
        </div>

        {#if pendingRecoveryError}
          <Alert variant="destructive">
            <AlertTitle>Unable to finalize recovery</AlertTitle>

            <AlertDescription>{pendingRecoveryError}</AlertDescription>
          </Alert>
        {/if}
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

  {#if status === "needs_setup" || status === "setup_in_progress"}
    <div class="mx-auto w-full max-w-4xl space-y-10">
      <Card>
        <CardHeader>
          <div class="flex items-center gap-3">
            <ShieldCheck class="text-primary" size={24} />

            <div>
              <CardTitle>Aegis Authentication</CardTitle>

              <CardDescription>
                Offline-first security with recovery phrase, strong password,
                and optional unlock 2FA.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent class="space-y-6">
          {#if localError}
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>

              <AlertDescription>{localError}</AlertDescription>
            </Alert>
          {/if}

          {#if onboardingStep === "username"}
            <form class="space-y-4" onsubmit={handleStartOnboarding}>
              <div class="space-y-2">
                <Label for="callsign">Choose your callsign</Label>

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

                <p class="text-xs text-muted-foreground">
                  This username identifies you across Aegis. You can change it
                  later once inside.
                </p>
              </div>

              <Button
                class="w-full"
                type="submit"
                disabled={isLoading || username.trim().length < 3}
              >
                <ShieldCheck size={16} /> Begin secure setup
              </Button>
            </form>
          {:else if onboardingStep === "phrase" && $authStore.onboarding}
            <div class="space-y-4">
              <h2 class="text-lg font-semibold flex items-center gap-2">
                <Save size={18} /> Save your recovery phrase
              </h2>

              <p class="text-sm text-muted-foreground">
                Write these 12 words down in order. They are the only way to
                rebuild your account if you forget your password.
              </p>

              <div class="grid grid-cols-3 gap-2 text-sm font-mono">
                {#each $authStore.onboarding.recoveryPhrase as word, index (index)}
                  <div
                    class="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200"
                  >
                    <span class="text-xs text-zinc-500 mr-2">{index + 1}.</span
                    >{word}
                  </div>
                {/each}
              </div>

              <Button class="w-full" onclick={goToConfirmation}>
                I have stored my recovery phrase
              </Button>
            </div>
          {:else if onboardingStep === "confirm" && $authStore.onboarding}
            <form class="space-y-4" onsubmit={goToPasswordStep}>
              <h2 class="text-lg font-semibold flex items-center gap-2">
                <Save size={18} /> Verify two random words
              </h2>

              <p class="text-sm text-muted-foreground">
                Enter the requested words to prove you saved the phrase
                correctly.
              </p>

              <div class="space-y-3">
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
                class="w-full"
                type="submit"
                disabled={!confirmReady || isLoading}
              >
                Continue to password setup
              </Button>
            </form>
          {:else if onboardingStep === "password"}
            <form class="space-y-4" onsubmit={handleSavePassword}>
              <h2 class="text-lg font-semibold flex items-center gap-2">
                <KeySquare size={18} /> Create your unlock password
              </h2>

              {#if unicodeRequired}
                <p class="text-sm text-muted-foreground">
                  Minimum 12 characters with uppercase, lowercase, numbers, and
                  special characters.
                </p>
              {:else}
                <p class="text-sm text-muted-foreground">
                  Minimum 12 characters. Unicode characters are optional while
                  you upgrade an existing identity.
                </p>
              {/if}

              {#if passwordInput}
                <div class="space-y-2">
                  <div class="flex items-center justify-between text-sm">
                    <span class="text-muted-foreground">Password strength:</span
                    >

                    <span
                      class="font-medium"
                      class:text-red-400={passwordStrength.score < 40}
                      class:text-yellow-400={passwordStrength.score >= 40 &&
                        passwordStrength.score < 80}
                      class:text-green-400={passwordStrength.score >= 80}
                    >
                      {passwordStrength.score < 40
                        ? "Weak"
                        : passwordStrength.score < 80
                          ? "Medium"
                          : "Strong"}
                    </span>
                  </div>

                  <Progress value={passwordStrength.score} max={100} />

                  {#if passwordStrength.feedback.length > 0}
                    <ul class="text-xs text-zinc-500 list-disc list-inside">
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
                    {#if showPassword}<EyeOff size={16} />{:else}<Eye
                        size={16}
                      />{/if}
                  </Button>
                </div>
              </div>

              <div class="space-y-2">
                <Label for="password-confirm">Confirm password</Label>

                <Input
                  id="password-confirm"
                  type="password"
                  class="px-3 py-2"
                  value={passwordConfirm}
                  oninput={(e) => {
                    const t = e.currentTarget as HTMLInputElement;
                    passwordConfirm = t.value;
                  }}
                  minlength={MIN_PASSWORD_LENGTH}
                  required
                  autocomplete="new-password"
                />
              </div>

              {#if passwordError}
                <Alert variant="destructive">
                  <AlertTitle>Password error</AlertTitle>

                  <AlertDescription>{passwordError}</AlertDescription>
                </Alert>
              {/if}

              <Button
                class="w-full"
                type="submit"
                disabled={isLoading || passwordStrength.score < 60}
              >
                Continue to security setup
              </Button>
            </form>
          {:else if onboardingStep === "security_questions"}
            <form class="space-y-4" onsubmit={handleSecurityQuestions}>
              <h2 class="text-lg font-semibold flex items-center gap-2">
                <Shield size={18} /> Configure security questions
              </h2>

              <p class="text-sm text-muted-foreground">
                Set up 3-5 security questions that only you know the answers to.
                These can help verify your identity during recovery.
              </p>

              {#each securityQuestions as question, index}
                <div class="space-y-3 p-4 border border-zinc-700 rounded-lg">
                  <div class="flex items-center justify-between">
                    <Label for={`question-${index}`}>Question {index + 1}</Label
                    >

                    {#if securityQuestions.length > 3}
                      <Button
                        type="button"
                        variant="ghost"
                        class="text-red-400 hover:text-destructive text-sm"
                        onclick={() => removeSecurityQuestion(index)}
                      >
                        Remove
                      </Button>
                    {/if}
                  </div>

                  <Select type="single" bind:value={question.question}>
                    <SelectTrigger
                      class="w-[200px]"
                      placeholder="Choose a question…"
                    />

                    <SelectContent>
                      {#each predefinedQuestions as q}
                        <SelectItem value={q}>{q}</SelectItem>
                      {/each}
                    </SelectContent>
                  </Select>

                  <Input
                    type="text"
                    placeholder="Your answer"
                    bind:value={question.answer}
                    minlength={3}
                    required
                  />
                </div>
              {/each}

              {#if securityQuestions.length < 5}
                <Button
                  type="button"
                  variant="outline"
                  class="w-full"
                  onclick={addSecurityQuestion}
                >
                  Add another question
                </Button>
              {/if}

              <Button
                class="w-full"
                type="submit"
                disabled={!securityQuestionsReady || isLoading}
              >
                Continue to backup codes
              </Button>
            </form>
          {:else if onboardingStep === "backup_codes" && backupCodes.length > 0}
            <div class="space-y-4">
              <h2 class="text-lg font-semibold flex items-center gap-2">
                <ShieldCheck size={18} /> Save your backup codes
              </h2>

              <p class="text-sm text-muted-foreground">
                Store these backup codes in a safe place. Each code can be used
                once to access your account if you lose your password and
                recovery phrase.
              </p>

              <Card class="bg-zinc-900 border-zinc-700">
                <CardContent class="p-4">
                  <div class="grid grid-cols-2 gap-2">
                    {#each backupCodes as code}
                      <Badge variant="secondary" class="justify-center"
                        >{code}</Badge
                      >
                    {/each}
                  </div>
                </CardContent>
              </Card>

              <Alert class="border-yellow-500/30">
                <TriangleAlert class="h-4 w-4 text-yellow-400" />

                <AlertDescription class="text-yellow-400">
                  Each code can only be used once. Store them securely offline.
                </AlertDescription>
              </Alert>

              <Button class="w-full" onclick={() => (onboardingStep = "totp")}>
                I have saved my backup codes
              </Button>
            </div>
          {:else if onboardingStep === "totp" && $authStore.onboarding}
            <form class="space-y-4" onsubmit={finishOnboarding}>
              <h2 class="text-lg font-semibold flex items-center gap-2">
                <KeyRound size={18} /> Pair your authenticator
              </h2>

              <p class="text-sm text-muted-foreground">
                Scan this QR with your authenticator app. Codes are only
                required for unlock if you enable that option in settings.
              </p>

              <div class="flex flex-col lg:flex-row gap-4 items-start">
                {#if totpQr}
                  <img
                    src={totpQr}
                    alt="Authenticator QR"
                    class="w-40 h-40 rounded-lg border border-zinc-800 bg-white p-2"
                  />
                {/if}

                <div class="space-y-2 text-sm">
                  <p class="text-xs uppercase text-zinc-500">
                    Manual setup key
                  </p>

                  <Input
                    value={$authStore.onboarding.totpSecret}
                    readonly
                    class="font-mono"
                  />
                </div>
              </div>

              <div class="space-y-2">
                <Label for="totp-setup">Authenticator code</Label>

                <Input
                  id="totp-setup"
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  class="w-full"
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
                class="w-full"
                type="submit"
                disabled={totpCode.length !== 6 || isLoading}
              >
                Complete onboarding
              </Button>
            </form>
          {/if}
        </CardContent>
      </Card>
    </div>
  {:else}
    <div class="mx-auto w-full max-w-3xl space-y-8">
      <div class="flex flex-wrap justify-center gap-3">
        <Button
          type="button"
          variant={activeView === "unlock" ? "default" : "ghost"}
          class="flex items-center gap-2"
          onclick={() => switchView("unlock")}
        >
          <Lock size={16} /> Unlock
        </Button>

        <Button
          type="button"
          variant={activeView === "recovery" ? "default" : "ghost"}
          class="flex items-center gap-2"
          onclick={() => {
            resetRecoveryFormFields();
            switchView("recovery");
            showRecoveryForm = false;
          }}
          disabled={!hasStoredSecurityQuestions && !pendingRecovery}
        >
          <Shield size={16} /> Security recovery
        </Button>

        <Button
          type="button"
          variant={activeView === "handoff" ? "default" : "ghost"}
          class="flex items-center gap-2"
          onclick={() => switchView("handoff")}
        >
          <QrCode size={16} /> Trusted device
        </Button>
      </div>

      {#if localError}
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>

          <AlertDescription>{localError}</AlertDescription>
        </Alert>
      {/if}

      {#if activeView === "unlock"}
        <Card>
          <CardHeader class="space-y-1">
            <CardTitle class="flex items-center gap-2">
              <Lock size={18} /> Unlock your identity
            </CardTitle>

            <CardDescription>
              Enter your password to decrypt your local identity.

              {#if requireTotpOnUnlock}
                A 6-digit authenticator code is required because you enabled it
                in settings.
              {/if}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form class="space-y-3" onsubmit={handleUnlock}>
              <div class="space-y-2">
                <Label for="unlock-password">Password</Label>

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
                <p class="text-sm text-destructive">{unlockPasswordError}</p>
              {/if}

              <Button
                class="w-full"
                type="submit"
                disabled={isLoading ||
                  unlockPassword.trim().length === 0 ||
                  (requireTotpOnUnlock && unlockTotp.length !== 6)}
              >
                Unlock account
              </Button>
            </form>
          </CardContent>
        </Card>

        {#if status === "account_locked"}
          <Alert variant="destructive">
            <div class="flex items-center gap-2">
              <Shield size={16} />

              <AlertTitle>Account Locked</AlertTitle>
            </div>

            <AlertDescription>
              Your account has been locked due to too many failed login
              attempts.

              {#if $authStore.accountLockedUntil}
                It will automatically unlock at {$authStore.accountLockedUntil.toLocaleTimeString()}.
              {/if}
            </AlertDescription>
          </Alert>
        {/if}
      {:else if activeView === "recovery"}
        <Card>
          <CardHeader class="space-y-1">
            <CardTitle class="flex items-center gap-2">
              <Shield size={16} /> Recover with security questions
            </CardTitle>

            <CardDescription>
              Answer your configured security questions to reset your password.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {#if !showRecoveryForm}
              <div class="space-y-3 text-sm text-muted-foreground">
                <p>Need to rotate your password without a recovery phrase?</p>

                <Button
                  class="w-full"
                  variant="outline"
                  type="button"
                  onclick={openRecoveryForm}
                  disabled={status === "recovery_ack_required"}
                >
                  <Shield size={16} class="mr-2" /> Start security question recovery
                </Button>
              </div>
            {:else}
              <form class="space-y-4" onsubmit={handleSecurityQuestionRecovery}>
                {#if recoveryQuestionPrompts.length === 0}
                  <Alert variant="destructive">
                    <AlertTitle>No security questions configured</AlertTitle>

                    <AlertDescription>
                      Add security questions from Settings before using this
                      recovery method.
                    </AlertDescription>
                  </Alert>
                {:else}
                  <div class="space-y-4">
                    {#each recoveryQuestionPrompts as prompt, index (prompt)}
                      <div class="space-y-1.5">
                        <Label for={`recovery-question-${index}`}
                          >{prompt}</Label
                        >

                        <Input
                          id={`recovery-question-${index}`}
                          type="text"
                          value={securityQuestionAnswers[prompt] ?? ""}
                          oninput={(event) => {
                            const target =
                              event.currentTarget as HTMLInputElement;

                            securityQuestionAnswers = {
                              ...securityQuestionAnswers,
                              [prompt]: target.value,
                            };
                          }}
                          autocomplete="off"
                        />
                      </div>
                    {/each}

                    <p class="text-xs text-muted-foreground">
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
                    <p class="text-xs text-destructive">
                      {recoveryPasswordValidation}
                    </p>
                  {/if}
                </div>

                <div class="space-y-2">
                  <Label for="recovery-password-confirm"
                    >Confirm new password</Label
                  >

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
                    <p class="text-xs text-destructive">
                      Passwords must match.
                    </p>
                  {/if}
                </div>

                {#if recoveryError}
                  <Alert variant="destructive">
                    <AlertTitle>Recovery failed</AlertTitle>
                    <AlertDescription>{recoveryError}</AlertDescription>
                  </Alert>
                {/if}

                <div class="flex flex-col gap-3 sm:flex-row">
                  <Button
                    class="w-full"
                    type="submit"
                    disabled={!recoveryFormReady ||
                      isLoading ||
                      status === "recovery_ack_required"}
                  >
                    Reset password with security questions
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
          </CardContent>
        </Card>
      {:else}
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <QrCode size={18} /> Trusted device handoff
            </CardTitle>
            <CardDescription>
              Open Aegis on another device, generate a login QR from Settings →
              Devices, and scan it here. Approval still requires a fresh
              authenticator code.
            </CardDescription>
          </CardHeader>

          <CardContent class="space-y-6">
            {#if $authStore.pendingDeviceLogin}
              <Alert>
                <AlertTitle>Login request</AlertTitle>
                <AlertDescription>
                  Login request from {$authStore.pendingDeviceLogin.username ??
                    "trusted device"}.
                </AlertDescription>
              </Alert>

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
                  class="w-full"
                  type="submit"
                  disabled={deviceTotp.length !== 6 || isLoading}
                >
                  Approve login
                </Button>
              </form>
            {:else}
              <Card class="bg-muted">
                <CardContent class="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Ready to link another device? Generate a QR from your
                    authenticated device to hand off credentials securely.
                  </p>

                  <Button
                    class="w-full"
                    variant="outline"
                    onclick={() => {
                      authStore.clearError();
                      showScanner = true;
                    }}
                  >
                    Launch camera scanner
                  </Button>
                </CardContent>
              </Card>
            {/if}
          </CardContent>
        </Card>
      {/if}
    </div>
  {/if}
</div>
