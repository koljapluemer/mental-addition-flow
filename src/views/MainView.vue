<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useActiveUser } from "@/composables/useActiveUser";
import { useUserSettings } from "@/composables/useUserSettings";
import {
  createExerciseRecord,
  markExerciseSolved,
  markExerciseTimedOut,
  updateExerciseMode,
  attachEvaluation,
} from "@/db/exercises";
import {
  db,
  logEvent,
  type EvaluationScope,
  type ExerciseMode,
  type ExerciseRecord,
} from "@/db";
import { generateExerciseOperands } from "@/utils/exercise";
import { logEvaluationPrompt, saveEvaluation } from "@/db/evaluations";
import Dexie from "dexie";

const { activeUserId, activeUserName } = useActiveUser();
const {
  graduallyIncreaseDifficulty,
  progressiveDifficultyActivatedAt,
  exerciseMode,
  loadUserSettings,
  updateExerciseMode: updateUserExerciseMode,
} = useUserSettings();

const inputValue = ref("");
const currentExercise = ref<ExerciseRecord | null>(null);
const isGeneratingExercise = ref(false);
const isProcessingSolve = ref(false);
const evaluationVisible = ref(false);
const evaluationExerciseIds = ref<number[]>([]);
const evaluationOptions = Array.from({ length: 9 }, (_, index) => index + 1);
const selectedEvaluationRating = ref<number | null>(null);
const answerInputRef = ref<HTMLInputElement | null>(null);
const keystrokeCount = ref(0);

// Timer state for timed mode
const timerProgress = ref(100);
const timerElapsed = ref(0);
const timerInterval = ref<ReturnType<typeof setInterval> | null>(null);
const correctAnswerGiven = ref(false);
const TIMER_DURATION_MS = 5000;
const TIMER_UPDATE_INTERVAL_MS = 50;

const evaluationScope: EvaluationScope = "the last exercise";

const canInteract = computed(
  () =>
    !evaluationVisible.value &&
    !!currentExercise.value &&
    !correctAnswerGiven.value,
);


function stopTimer() {
  if (timerInterval.value) {
    clearInterval(timerInterval.value);
    timerInterval.value = null;
  }
}

function resetState() {
  inputValue.value = "";
  currentExercise.value = null;
  isGeneratingExercise.value = false;
  isProcessingSolve.value = false;
  evaluationVisible.value = false;
  evaluationExerciseIds.value = [];
  selectedEvaluationRating.value = null;
  keystrokeCount.value = 0;
  correctAnswerGiven.value = false;
  timerProgress.value = 100;
  timerElapsed.value = 0;
  stopTimer();
}

function startTimer() {
  if (!activeUserId.value || !currentExercise.value) return;

  stopTimer();
  timerElapsed.value = 0;
  timerProgress.value = 100;
  correctAnswerGiven.value = false;

  const startTime = Date.now();

  void logEvent({
    userId: activeUserId.value,
    type: "timer_started",
    exerciseId: currentExercise.value.id,
    payload: { duration: TIMER_DURATION_MS },
  });

  timerInterval.value = setInterval(async () => {
    timerElapsed.value = Date.now() - startTime;
    timerProgress.value = Math.max(0, ((TIMER_DURATION_MS - timerElapsed.value) / TIMER_DURATION_MS) * 100);

    if (timerElapsed.value >= TIMER_DURATION_MS) {
      stopTimer();
      await handleTimerComplete();
    }
  }, TIMER_UPDATE_INTERVAL_MS);
}

async function handleTimerComplete() {
  if (!activeUserId.value || !currentExercise.value?.id) return;

  if (!correctAnswerGiven.value) {
    // Timer expired without correct answer
    await markExerciseTimedOut(currentExercise.value.id, activeUserId.value);
  }

  // Show evaluation prompt
  await openEvaluationPrompt();
}

async function startNewExercise(forceMode?: ExerciseMode) {
  if (!activeUserId.value) return;
  if (isGeneratingExercise.value) return;

  isGeneratingExercise.value = true;
  try {
    let operands;
    if (graduallyIncreaseDifficulty.value && progressiveDifficultyActivatedAt.value) {
      // Get count of solved exercises since progressive difficulty was activated
      const solvedCount = await db.exercises
        .where({ userId: activeUserId.value })
        .and(
          (ex) =>
            ex.solvedAt !== undefined &&
            ex.displayedAt >= (progressiveDifficultyActivatedAt.value ?? 0),
        )
        .count();

      operands = generateExerciseOperands({
        solvedCount,
        maxDigits: 4,
      });
    } else {
      operands = generateExerciseOperands();
    }

    const exercise = await createExerciseRecord({
      userId: activeUserId.value,
      operandA: operands.operandA,
      operandB: operands.operandB,
      mode: forceMode ?? exerciseMode.value,
    });
    currentExercise.value = exercise ?? null;
    inputValue.value = "";
    keystrokeCount.value = 0;
    correctAnswerGiven.value = false;

    await nextTick();
    answerInputRef.value?.focus();

    // Start timer if in timed mode
    if (exerciseMode.value === "timed") {
      startTimer();
    }
  } finally {
    isGeneratingExercise.value = false;
  }
}

async function ensureExerciseAvailable() {
  if (
    !currentExercise.value &&
    activeUserId.value &&
    !evaluationVisible.value
  ) {
    await startNewExercise();
  }
}

function sanitizeInput(raw: string) {
  return raw.replace(/[^0-9]/g, "");
}

async function handleInput(event: Event) {
  if (!activeUserId.value) return;
  if (!currentExercise.value) return;

  const target = event.target as HTMLInputElement;
  const sanitized = sanitizeInput(target.value);

  if (sanitized !== target.value) {
    target.value = sanitized;
  }

  inputValue.value = sanitized;

  await logEvent({
    userId: activeUserId.value,
    type: "input_change",
    exerciseId: currentExercise.value.id,
    payload: {
      value: sanitized,
      length: sanitized.length,
    },
  });

  if (
    !isProcessingSolve.value &&
    sanitized &&
    Number(sanitized) === currentExercise.value.answer
  ) {
    await handleCorrectAnswer();
  }
}

async function handleKeydown(event: KeyboardEvent) {
  if (!activeUserId.value || !currentExercise.value) return;

  // Count meaningful keystrokes: digits, backspace, delete
  const key = event.key;
  if (/^[0-9]$/.test(key) || key === "Backspace" || key === "Delete") {
    keystrokeCount.value++;
  }

  await logEvent({
    userId: activeUserId.value,
    type: "input_keydown",
    exerciseId: currentExercise.value.id,
    payload: {
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    },
  });
}

async function handleFocus() {
  if (!activeUserId.value || !currentExercise.value) return;

  await logEvent({
    userId: activeUserId.value,
    type: "input_focus",
    exerciseId: currentExercise.value.id,
    payload: {
      value: inputValue.value,
    },
  });
}

async function handleBlur() {
  if (!activeUserId.value || !currentExercise.value) return;

  await logEvent({
    userId: activeUserId.value,
    type: "input_blur",
    exerciseId: currentExercise.value.id,
    payload: {
      value: inputValue.value,
    },
  });
}

async function handleCorrectAnswer() {
  if (!currentExercise.value || !activeUserId.value) return;
  if (!currentExercise.value.id) return;

  isProcessingSolve.value = true;
  correctAnswerGiven.value = true;

  await markExerciseSolved(currentExercise.value.id, {
    userId: activeUserId.value,
    inputValue: inputValue.value,
    mode: exerciseMode.value,
    keystrokeCount: keystrokeCount.value,
    timedOut: false,
  });

  await logEvent({
    userId: activeUserId.value,
    type: "correct_answer_during_timer",
    exerciseId: currentExercise.value.id,
    payload: {
      timerElapsed: timerElapsed.value,
      timerRemaining: TIMER_DURATION_MS - timerElapsed.value,
    },
  });

  // In self-paced mode, immediately show evaluation
  // In timed mode, wait for timer to complete
  if (exerciseMode.value === "self-paced") {
    stopTimer();
    await openEvaluationPrompt();
  }
  // If timed mode, timer will continue and handleTimerComplete will show evaluation

  isProcessingSolve.value = false;
}

async function openEvaluationPrompt() {
  if (
    !currentExercise.value ||
    !currentExercise.value.id ||
    !activeUserId.value
  )
    return;

  selectedEvaluationRating.value = null;

  // Get the last exercise (just the current one that was solved)
  const recentExercises = await db.exercises
    .where("[userId+displayedAt]")
    .between(
      [activeUserId.value, Dexie.minKey],
      [activeUserId.value, Dexie.maxKey],
    )
    .reverse()
    .limit(1)
    .toArray();

  evaluationExerciseIds.value = recentExercises
    .map((item) => item.id!)
    .filter(Boolean);

  if (evaluationExerciseIds.value.length === 0) {
    evaluationVisible.value = false;
    await startNewExercise();
    return;
  }

  await logEvaluationPrompt(
    activeUserId.value,
    currentExercise.value.id!,
    evaluationScope,
    exerciseMode.value,
  );

  evaluationVisible.value = true;
}

async function submitEvaluation(rating: number) {
  if (!activeUserId.value) return;
  if (evaluationExerciseIds.value.length === 0) return;

  const evaluation = await saveEvaluation({
    userId: activeUserId.value,
    scope: evaluationScope,
    rating,
    exerciseIds: [...evaluationExerciseIds.value],
    mode: exerciseMode.value,
  });

  if (evaluation?.id) {
    await attachEvaluation(
      [...evaluationExerciseIds.value],
      evaluation.id,
      activeUserId.value,
    );
  }

  evaluationVisible.value = false;
  evaluationExerciseIds.value = [];
  selectedEvaluationRating.value = null;
  await startNewExercise();
}

async function skipEvaluation() {
  if (!activeUserId.value || !currentExercise.value?.id) return;

  await logEvent({
    userId: activeUserId.value,
    type: "evaluation_skipped",
    exerciseId: currentExercise.value.id,
    payload: {
      scope: evaluationScope,
    },
  });

  evaluationVisible.value = false;
  evaluationExerciseIds.value = [];
  selectedEvaluationRating.value = null;
  await startNewExercise();
}

async function selectEvaluationRating(rating: number) {
  if (!activeUserId.value) return;

  selectedEvaluationRating.value = rating;

  const referenceExerciseId = evaluationExerciseIds.value[0] ?? currentExercise.value?.id;

  await logEvent({
    userId: activeUserId.value,
    type: "evaluation_rating_selected",
    exerciseId: referenceExerciseId,
    payload: {
      rating,
      scope: evaluationScope,
      exerciseIds: [...evaluationExerciseIds.value],
    },
  });

  // Immediately submit the evaluation
  await submitEvaluation(rating);
}

function handleEvaluationKeydown(event: KeyboardEvent) {
  if (!evaluationVisible.value) return;

  const key = event.key;
  const rating = parseInt(key, 10);

  if (rating >= 1 && rating <= 9) {
    event.preventDefault();
    void selectEvaluationRating(rating);
  }
}

async function onModeToggle(event: Event) {
  if (!activeUserId.value) return;
  const target = event.target as HTMLInputElement;
  const nextMode: ExerciseMode = target.checked ? "timed" : "self-paced";

  if (exerciseMode.value === nextMode) return;

  const previous = exerciseMode.value;

  await updateUserExerciseMode(activeUserId.value, nextMode);

  await logEvent({
    userId: activeUserId.value,
    type: "exercise_mode_changed",
    payload: { from: previous, to: nextMode },
  });

  // Replace current exercise with new mode
  if (currentExercise.value?.id) {
    await updateExerciseMode(
      currentExercise.value.id,
      nextMode,
      activeUserId.value,
    );
  }

  stopTimer();
  await startNewExercise();
}

function handleVisibilityChange() {
  if (!activeUserId.value) return;
  void logEvent({
    userId: activeUserId.value,
    type: "document_visibility",
    payload: { hidden: document.hidden },
  });
}

function handleWindowFocus() {
  if (!activeUserId.value) return;
  void logEvent({
    userId: activeUserId.value,
    type: "window_focus",
    payload: { focused: true },
  });
}

function handleWindowBlur() {
  if (!activeUserId.value) return;
  void logEvent({
    userId: activeUserId.value,
    type: "window_focus",
    payload: { focused: false },
  });
}

watch(
  () => activeUserId.value,
  async (userId, previous) => {
    if (!userId) {
      resetState();
      return;
    }

    if (userId !== previous) {
      resetState();
      await loadUserSettings(userId);
      await startNewExercise();
    }
  },
  { immediate: true },
);

onMounted(async () => {
  await ensureExerciseAvailable();
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("focus", handleWindowFocus);
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("keydown", handleEvaluationKeydown);
});

onUnmounted(() => {
  stopTimer();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("focus", handleWindowFocus);
  window.removeEventListener("blur", handleWindowBlur);
  window.removeEventListener("keydown", handleEvaluationKeydown);
});

const exerciseDisplay = computed(() => {
  if (!currentExercise.value) return "";
  return `${currentExercise.value.operandA} + ${currentExercise.value.operandB}`;
});

const inputPlaceholder = computed(() =>
  exerciseMode.value === "timed" ? "Type answer" : "Your answer",
);
</script>

<template>
  <section
    class="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center gap-8 py-10"
  >
    <div
      class="flex w-full flex-col items-center gap-4 text-center sm:flex-row sm:justify-between"
    >
      <div class="flex items-center gap-4">
        <span class="badge badge-primary badge-outline">{{
          exerciseMode.toUpperCase().replace('-', ' ')
        }}</span>
        <label class="flex items-center gap-3 text-sm font-semibold">
          <span class="uppercase tracking-wide text-base-content/50"
            >Self-Paced</span
          >
          <input
            type="checkbox"
            class="toggle toggle-primary"
            :checked="exerciseMode === 'timed'"
            :disabled="evaluationVisible || !activeUserId"
            @change="onModeToggle"
          />
          <span class="uppercase tracking-wide text-base-content/50"
            >Timed</span
          >
        </label>
      </div>
      <div class="text-sm uppercase tracking-widest text-base-content/60">
        {{ activeUserName }}
      </div>
    </div>

    <!-- Timer Progress Bar (only in timed mode) -->
    <div v-if="exerciseMode === 'timed' && currentExercise" class="w-full">
      <progress
        class="progress progress-primary w-full h-2"
        :value="timerProgress"
        max="100"
      ></progress>
    </div>

    <div
      class="flex h-56 w-full items-center justify-center rounded-2xl bg-base-100 shadow-xl"
    >
      <div class="text-center text-6xl font-black leading-tight sm:text-7xl">
        <span v-if="currentExercise">{{ exerciseDisplay }}</span>
        <span
          v-else
          class="loading loading-spinner loading-lg text-primary"
          aria-hidden="true"
        ></span>
      </div>
    </div>

    <div class="w-full">
      <label class="input input-bordered input-lg flex items-center gap-3">
        <span class="text-xl font-semibold">=</span>
        <input
          id="answer-input"
          ref="answerInputRef"
          :value="inputValue"
          :placeholder="inputPlaceholder"
          class="grow text-4xl font-bold"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :disabled="!canInteract"
          maxlength="5"
          @input="handleInput"
          @keydown="handleKeydown"
          @focus="handleFocus"
          @blur="handleBlur"
        />
      </label>
    </div>
  </section>

  <dialog v-if="evaluationVisible" class="modal modal-open">
    <div class="modal-box max-w-3xl space-y-6">
      <header class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-primary">
          Paas Cognitive Load Scale
        </p>
        <h3 class="text-2xl font-bold leading-tight">
          How much mental effort did you invest in the last exercise?
        </h3>
        <p class="text-sm text-base-content/70">
          Select one response that best reflects your effort. Use the full scale.
        </p>
      </header>

      <section class="space-y-4">
        <div
          class="flex justify-between text-xs font-semibold uppercase tracking-wide text-base-content/60"
        >
          <span>1 · Very low effort</span>
          <span>9 · Very high effort</span>
        </div>
        <div class="grid grid-cols-9 gap-2">
          <label
            v-for="option in evaluationOptions"
            :key="option"
            class="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-transparent bg-base-200/40 px-3 py-4 transition-colors hover:border-primary/50"
            :class="{
              'border-primary bg-primary text-primary-content shadow-lg hover:border-primary':
                selectedEvaluationRating === option,
            }"
          >
            <input
              :aria-label="`Effort rating ${option}`"
              class="radio radio-primary"
              type="radio"
              name="effort-rating"
              :value="option"
              :checked="selectedEvaluationRating === option"
              @change="selectEvaluationRating(option)"
            />
            <span class="text-sm font-semibold">{{ option }}</span>
          </label>
        </div>
        <p class="text-xs text-base-content/60">
          The Paas scale ranges from 1 (very, very low effort) to 9 (very, very high
          effort).
        </p>
      </section>

      <footer class="modal-action justify-between">
        <button type="button" class="btn btn-ghost" @click="skipEvaluation">
          Skip
        </button>
      </footer>
    </div>
  </dialog>
</template>
