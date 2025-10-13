<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { liveQuery } from "dexie";
import { useRouter, useRoute } from "vue-router";
import { db, type UserRecord } from "@/db";
import { useActiveUser } from "@/composables/useActiveUser";
import { useUserSettings } from "@/composables/useUserSettings";
import { useDifficultyCalculation } from "@/composables/useDifficultyCalculation";
import type { DifficultyWeights } from "@/types/difficulty";
import { mergeDifficultyWeights } from "@/types/difficulty";

const router = useRouter();
const route = useRoute();
const users = ref<UserRecord[]>([]);
const newUserName = ref("");
const isSubmitting = ref(false);
const errorMessage = ref("");

const { setActiveUser, createUser, activeUserId } = useActiveUser();
const {
  graduallyIncreaseDifficulty,
  loadUserSettings,
  updateGraduallyIncreaseDifficulty,
} = useUserSettings();

const {
  countTotalDigits,
  countZeros,
  countCarryovers,
  calculateDifficultyScore,
  calculateDifficultyRange,
  normalizeDifficulty,
} = useDifficultyCalculation();

let subscription: { unsubscribe: () => void } | null = null;

onMounted(() => {
  subscription = liveQuery(() =>
    db.users.orderBy("lastActiveAt").reverse().toArray(),
  ).subscribe({
    next(data) {
      users.value = data;
    },
  });
});

onUnmounted(() => {
  subscription?.unsubscribe();
});

function resetError() {
  errorMessage.value = "";
}

async function goToDestination() {
  const redirect =
    typeof route.query.redirect === "string" ? route.query.redirect : "/";
  await router.push(redirect);
}

async function handleSelectUser(userId: number) {
  await setActiveUser(userId);
  await goToDestination();
}

async function handleCreateUser() {
  if (isSubmitting.value) return;
  resetError();
  const trimmed = newUserName.value.trim();
  if (!trimmed) {
    errorMessage.value = "Please enter a name.";
    return;
  }
  isSubmitting.value = true;
  try {
    await createUser(trimmed);
    newUserName.value = "";
    await goToDestination();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "Unable to create user.";
  } finally {
    isSubmitting.value = false;
  }
}

async function handleToggleDifficulty(event: Event) {
  if (!activeUserId.value) return;
  const target = event.target as HTMLInputElement;
  await updateGraduallyIncreaseDifficulty(activeUserId.value, target.checked);
}

watch(activeUserId, async (userId) => {
  if (userId) {
    await loadUserSettings(userId);
  }
}, { immediate: true });

async function downloadAllData() {
  if (!activeUserId.value) return;

  const data = {
    exportedAt: new Date().toISOString(),
    user: await db.users.get(activeUserId.value),
    settings: await db.userSettings.get({ userId: activeUserId.value }),
    exercises: await db.exercises.where({ userId: activeUserId.value }).toArray(),
    events: await db.events.where({ userId: activeUserId.value }).toArray(),
    evaluations: await db.evaluations.where({ userId: activeUserId.value }).toArray(),
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mental-addition-data-${data.user?.name}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCSV(value: any): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function getDifficultyWeights(userId: number): Promise<DifficultyWeights> {
  const settings = await db.userSettings.get({ userId });
  return mergeDifficultyWeights(settings?.difficultyWeights);
}

async function downloadExercisesCSV() {
  if (!activeUserId.value) return;

  const user = await db.users.get(activeUserId.value);
  const exercises = await db.exercises
    .where({ userId: activeUserId.value })
    .toArray();

  const weights = await getDifficultyWeights(activeUserId.value);
  const difficultyRange = calculateDifficultyRange(exercises, weights, "all");

  // Load evaluations and build rating map
  const evaluations = await db.evaluations
    .where({ userId: activeUserId.value })
    .toArray();

  const ratingMap = new Map<number, number[]>();
  evaluations.forEach(evaluation => {
    evaluation.exerciseIds.forEach(exerciseId => {
      if (!ratingMap.has(exerciseId)) {
        ratingMap.set(exerciseId, []);
      }
      ratingMap.get(exerciseId)!.push(evaluation.rating);
    });
  });

  const avgRatingMap = new Map<number, number>();
  ratingMap.forEach((ratings, exerciseId) => {
    const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
    avgRatingMap.set(exerciseId, avg);
  });

  const headers = [
    "id",
    "userId",
    "operandA",
    "operandB",
    "answer",
    "displayedAt",
    "displayedAt_ISO",
    "solvedAt",
    "solvedAt_ISO",
    "duration_ms",
    "mode",
    "evaluationId",
    "keystrokeCount",
    "idealKeystrokeCount",
    "isIdealKeystrokes",
    "totalDigits",
    "zeroCount",
    "carryoverCount",
    "predictedDifficulty",
    "avgCLRating",
  ];

  const rows = exercises.map((ex) => {
    const duration = ex.solvedAt && ex.displayedAt
      ? ex.solvedAt - ex.displayedAt
      : null;

    const idealKeystrokeCount = String(ex.answer).length;
    const isIdealKeystrokes = ex.keystrokeCount !== undefined
      ? ex.keystrokeCount === idealKeystrokeCount
      : "";

    const totalDigits = countTotalDigits(ex.operandA, ex.operandB);
    const zeroCount = countZeros(ex.operandA, ex.operandB);
    const carryoverCount = countCarryovers(ex.operandA, ex.operandB);
    const avgRating = ex.id ? avgRatingMap.get(ex.id) ?? "" : "";
    const rawDifficulty = calculateDifficultyScore(ex, weights);
    const normalizedDifficulty = normalizeDifficulty(rawDifficulty, difficultyRange);
    const predictedDifficulty = Number.isFinite(normalizedDifficulty)
      ? Number(normalizedDifficulty.toFixed(1))
      : "";

    return [
      ex.id,
      ex.userId,
      ex.operandA,
      ex.operandB,
      ex.answer,
      ex.displayedAt,
      new Date(ex.displayedAt).toISOString(),
      ex.solvedAt ?? "",
      ex.solvedAt ? new Date(ex.solvedAt).toISOString() : "",
      duration ?? "",
      ex.mode,
      ex.evaluationId ?? "",
      ex.keystrokeCount ?? "",
      idealKeystrokeCount,
      isIdealKeystrokes,
      totalDigits,
      zeroCount,
      carryoverCount,
      predictedDifficulty,
      avgRating !== "" ? avgRating.toFixed(1) : "",
    ];
  });

  const csv = [
    headers.map(escapeCSV).join(","),
    ...rows.map(row => row.map(escapeCSV).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `exercises-${user?.name}-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function downloadEvaluationsCSV() {
  if (!activeUserId.value) return;

  const user = await db.users.get(activeUserId.value);
  const evaluations = await db.evaluations
    .where({ userId: activeUserId.value })
    .toArray();

  const headers = [
    "id",
    "userId",
    "scope",
    "rating",
    "exerciseIds",
    "mode",
    "createdAt",
    "createdAt_ISO",
  ];

  const rows = evaluations.map((ev) => {
    return [
      ev.id,
      ev.userId,
      ev.scope,
      ev.rating,
      ev.exerciseIds.join(";"),
      ev.mode,
      ev.createdAt,
      new Date(ev.createdAt).toISOString(),
    ];
  });

  const csv = [
    headers.map(escapeCSV).join(","),
    ...rows.map(row => row.map(escapeCSV).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `evaluations-${user?.name}-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="mx-auto flex w-full max-w-3xl flex-col gap-8 py-12">
    <header class="space-y-2 text-center">
      <h1 class="text-3xl font-bold">Choose or create a user</h1>
      <p class="text-base-content/70">
        All tracking data links to the active user. Select an existing entry or
        add a new one to continue.
      </p>
    </header>

    <div
      v-if="activeUserId"
      class="card border border-base-300 bg-base-100 shadow"
    >
      <div class="card-body">
        <h2 class="card-title text-lg">Settings</h2>
        <div class="form-control">
          <label class="label cursor-pointer justify-start gap-4">
            <input
              type="checkbox"
              class="toggle toggle-primary"
              :checked="graduallyIncreaseDifficulty"
              @change="handleToggleDifficulty"
            />
            <div class="space-y-1">
              <span class="label-text font-semibold"
                >Gradually increase difficulty</span
              >
              <p class="text-sm text-base-content/60">
                Start with single digit addition and progressively increase
                complexity every 3 exercises
              </p>
            </div>
          </label>
        </div>
      </div>
    </div>

    <div
      v-if="activeUserId"
      class="card border border-base-300 bg-base-100 shadow"
    >
      <div class="card-body">
        <h2 class="card-title text-lg">Data Export</h2>
        <div class="space-y-4">
          <div>
            <h3 class="font-semibold mb-2">CSV Exports</h3>
            <p class="text-sm text-base-content/60 mb-3">
              Export your data as CSV files for analysis in spreadsheet applications
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                @click="downloadExercisesCSV"
              >
                Export Exercises CSV
              </button>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                @click="downloadEvaluationsCSV"
              >
                Export CL Ratings CSV
              </button>
            </div>
          </div>
          <div class="divider"></div>
          <div>
            <h3 class="font-semibold mb-2">Complete Data Export</h3>
            <p class="text-sm text-base-content/60 mb-3">
              Download all your data including exercises, events, and evaluations as JSON
            </p>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              @click="downloadAllData"
            >
              Download JSON Data
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="users.length" class="grid gap-4 md:grid-cols-2">
      <article
        v-for="user in users"
        :key="user.id"
        class="card border border-base-300 bg-base-100 shadow"
      >
        <div class="card-body">
          <h2 class="card-title">
            <span>{{ user.name }}</span>
            <span v-if="activeUserId === user.id" class="badge badge-primary"
              >Active</span
            >
          </h2>
          <p class="text-sm text-base-content/60">
            Last active: {{ new Date(user.lastActiveAt).toLocaleString() }}
          </p>
          <div class="card-actions justify-end">
            <button
              type="button"
              class="btn btn-primary"
              @click="handleSelectUser(user.id!)"
            >
              Use
            </button>
          </div>
        </div>
      </article>
    </div>
    <div
      v-else
      class="rounded-2xl border border-dashed border-base-300 p-8 text-center text-base-content/60"
    >
      No users yet. Create your first participant below.
    </div>

    <form
      class="card border border-base-300 bg-base-100 shadow"
      @submit.prevent="handleCreateUser"
    >
      <div class="card-body space-y-4">
        <div class="space-y-2">
          <label class="label">
            <span class="label-text text-lg font-semibold">Add a new user</span>
          </label>
          <input
            v-model="newUserName"
            type="text"
            class="input input-bordered input-lg"
            placeholder="Participant name"
            @input="resetError"
          />
        </div>
        <p v-if="errorMessage" class="text-sm text-error">{{ errorMessage }}</p>
        <div class="card-actions justify-end">
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="isSubmitting"
          >
            <span v-if="isSubmitting" class="loading loading-spinner"></span>
            <span v-else>Create user</span>
          </button>
        </div>
      </div>
    </form>
  </section>
</template>
