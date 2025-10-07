<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { liveQuery } from "dexie";
import Dexie from "dexie";
import {
  db,
  type EvaluationRecord,
  type ExerciseRecord,
  type ExerciseMode,
} from "@/db";
import { useActiveUser } from "@/composables/useActiveUser";

interface LogEntry {
  id: string;
  type: "exercise" | "evaluation";
  timestamp: number;
  exercise?: ExerciseRecord;
  evaluation?: EvaluationRecord;
}

const { activeUserId } = useActiveUser();
const allEntries = ref<LogEntry[]>([]);
const modeFilter = ref<ExerciseMode | "all">("all");
const evaluatedFilter = ref<"all" | "with" | "without">("all");
let subscription: { unsubscribe: () => void } | null = null;

watch(
  () => activeUserId.value,
  (userId) => {
    subscription?.unsubscribe();
    allEntries.value = [];

    if (!userId) {
      return;
    }

    subscription = liveQuery(async () => {
      const exercises = await db.exercises
        .where("[userId+displayedAt]")
        .between([userId, Dexie.minKey], [userId, Dexie.maxKey])
        .reverse()
        .limit(200)
        .toArray();

      const evaluations = await db.evaluations
        .where("userId")
        .equals(userId)
        .reverse()
        .limit(100)
        .toArray();

      const evaluationMap = new Map<number, EvaluationRecord>();
      evaluations.forEach((evaluation) => {
        if (evaluation?.id) {
          evaluationMap.set(evaluation.id, evaluation);
        }
      });

      const exerciseEntries: LogEntry[] = exercises.map((exercise) => ({
        id: `exercise-${exercise.id}`,
        type: "exercise" as const,
        timestamp: exercise.displayedAt,
        exercise,
      }));

      const evaluationEntries: LogEntry[] = evaluations.map((evaluation) => ({
        id: `evaluation-${evaluation.id}`,
        type: "evaluation" as const,
        timestamp: evaluation.createdAt,
        evaluation,
      }));

      const combined = [...exerciseEntries, ...evaluationEntries].sort(
        (a, b) => b.timestamp - a.timestamp,
      );

      return combined;
    }).subscribe({
      next(data) {
        allEntries.value = data ?? [];
      },
    });
  },
  { immediate: true },
);

onUnmounted(() => {
  subscription?.unsubscribe();
});

const filteredEntries = computed(() => {
  return allEntries.value.filter((entry) => {
    // Filter by mode
    if (modeFilter.value !== "all") {
      if (entry.type === "exercise" && entry.exercise?.mode !== modeFilter.value) {
        return false;
      }
      if (entry.type === "evaluation" && entry.evaluation?.mode !== modeFilter.value) {
        return false;
      }
    }

    // Filter by evaluation status (only applies to exercises)
    if (evaluatedFilter.value !== "all" && entry.type === "exercise") {
      const hasEvaluation = !!entry.exercise?.evaluationId;
      if (evaluatedFilter.value === "with" && !hasEvaluation) {
        return false;
      }
      if (evaluatedFilter.value === "without" && hasEvaluation) {
        return false;
      }
    }

    return true;
  });
});

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString();
}

function formatDuration(exercise: ExerciseRecord) {
  if (!exercise.solvedAt) return "In progress";
  const duration = exercise.solvedAt - exercise.displayedAt;
  const seconds = (duration / 1000).toFixed(2);
  return `${seconds}s`;
}

function getKeystrokeEfficiency(exercise: ExerciseRecord): "perfect" | "good" | "poor" | null {
  if (exercise.keystrokeCount === undefined) return null;

  const answerLength = exercise.answer.toString().length;
  const excess = exercise.keystrokeCount - answerLength;

  if (excess === 0) return "perfect";
  if (excess <= 2) return "good";
  return "poor";
}
</script>

<template>
  <section class="mx-auto flex w-full max-w-6xl flex-col gap-6 py-12">
    <header>
      <h1 class="text-3xl font-bold">Activity Log</h1>
      <p class="text-base-content/60">
        Exercise and evaluation history with filtering options
      </p>
    </header>

    <div class="flex flex-wrap gap-4">
      <div class="form-control">
        <label class="label">
          <span class="label-text font-semibold">Mode</span>
        </label>
        <select v-model="modeFilter" class="select select-bordered">
          <option value="all">All modes</option>
          <option value="trial">Trial only</option>
          <option value="serious">Serious only</option>
        </select>
      </div>

      <div class="form-control">
        <label class="label">
          <span class="label-text font-semibold">Evaluation</span>
        </label>
        <select v-model="evaluatedFilter" class="select select-bordered">
          <option value="all">All</option>
          <option value="with">With evaluation</option>
          <option value="without">Without evaluation</option>
        </select>
      </div>
    </div>

    <div v-if="filteredEntries.length" class="overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>Time</th>
            <th>Type</th>
            <th>Details</th>
            <th>Mode</th>
            <th>Duration</th>
            <th>Keystrokes</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in filteredEntries"
            :key="entry.id"
            :class="{
              '!bg-warning/30': entry.type === 'evaluation',
            }"
          >
            <td class="text-xs">{{ formatTimestamp(entry.timestamp) }}</td>
            <td>
              <span
                v-if="entry.type === 'evaluation'"
                class="badge badge-warning badge-sm"
                >Effort Rating</span
              >
              <span v-else class="badge badge-ghost badge-sm">Exercise</span>
            </td>
            <td>
              <div v-if="entry.type === 'exercise' && entry.exercise">
                <span class="font-mono font-bold">
                  {{ entry.exercise.operandA }} + {{ entry.exercise.operandB }} =
                  {{ entry.exercise.answer }}
                </span>
                <span
                  v-if="!entry.exercise.solvedAt"
                  class="ml-2 text-base-content/50 text-xs"
                  >(unsolved)</span
                >
              </div>
              <div v-if="entry.type === 'evaluation' && entry.evaluation">
                <span class="font-semibold"
                  >Rating: {{ entry.evaluation.rating }}/9</span
                >
                <span class="ml-2 text-sm text-base-content/60"
                  >({{ entry.evaluation.scope }})</span
                >
              </div>
            </td>
            <td>
              <span
                v-if="entry.type === 'exercise' && entry.exercise"
                class="badge badge-sm"
                :class="
                  entry.exercise.mode === 'serious'
                    ? 'badge-error'
                    : 'badge-neutral'
                "
              >
                {{ entry.exercise.mode }}
              </span>
              <span
                v-if="entry.type === 'evaluation' && entry.evaluation"
                class="badge badge-sm"
                :class="
                  entry.evaluation.mode === 'serious'
                    ? 'badge-error'
                    : 'badge-neutral'
                "
              >
                {{ entry.evaluation.mode }}
              </span>
            </td>
            <td>
              <span v-if="entry.type === 'exercise' && entry.exercise">
                {{ formatDuration(entry.exercise) }}
              </span>
              <span v-else class="text-base-content/40">—</span>
            </td>
            <td>
              <div
                v-if="
                  entry.type === 'exercise' &&
                  entry.exercise?.keystrokeCount !== undefined
                "
                class="flex items-center gap-2"
              >
                <div
                  class="h-3 w-3 rounded-full"
                  :class="{
                    'bg-success': getKeystrokeEfficiency(entry.exercise) === 'perfect',
                    'bg-warning': getKeystrokeEfficiency(entry.exercise) === 'good',
                    'bg-error': getKeystrokeEfficiency(entry.exercise) === 'poor',
                  }"
                ></div>
                <span>{{ entry.exercise.keystrokeCount }}</span>
              </div>
              <span v-else class="text-base-content/40">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      v-else
      class="rounded-2xl border border-dashed border-base-300 p-10 text-center text-base-content/60"
    >
      No data to display. Complete a few exercises to see logs here.
    </div>
  </section>
</template>
