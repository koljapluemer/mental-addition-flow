<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { liveQuery } from "dexie";
import Dexie from "dexie";
import { db, type EvaluationRecord, type ExerciseRecord } from "@/db";
import { useActiveUser } from "@/composables/useActiveUser";

interface ExerciseLogEntry {
  exercise: ExerciseRecord;
  evaluation: EvaluationRecord | null;
  eventCount: number;
}

const { activeUserId } = useActiveUser();
const entries = ref<ExerciseLogEntry[]>([]);
let subscription: { unsubscribe: () => void } | null = null;

watch(
  () => activeUserId.value,
  (userId) => {
    subscription?.unsubscribe();
    entries.value = [];

    if (!userId) {
      return;
    }

    subscription = liveQuery(async () => {
      const exercises = await db.exercises
        .where("[userId+displayedAt]")
        .between([userId, Dexie.minKey], [userId, Dexie.maxKey])
        .reverse()
        .limit(100)
        .toArray();

      const evaluationIds = exercises
        .map((exercise) => exercise.evaluationId)
        .filter((id): id is number => typeof id === "number");

      const uniqueEvaluationIds = Array.from(new Set(evaluationIds));
      const evaluations = uniqueEvaluationIds.length
        ? await db.evaluations.bulkGet(uniqueEvaluationIds)
        : [];

      const evaluationMap = new Map<number, EvaluationRecord>();
      evaluations.forEach((evaluation) => {
        if (evaluation?.id) {
          evaluationMap.set(evaluation.id, evaluation);
        }
      });

      const enriched = await Promise.all(
        exercises.map(async (exercise) => {
          const eventCount = exercise.id
            ? await db.events.where("exerciseId").equals(exercise.id).count()
            : 0;
          const evaluation = exercise.evaluationId
            ? (evaluationMap.get(exercise.evaluationId) ?? null)
            : null;
          return {
            exercise,
            evaluation,
            eventCount,
          };
        }),
      );

      return enriched;
    }).subscribe({
      next(data) {
        entries.value = data ?? [];
      },
    });
  },
  { immediate: true },
);

onUnmounted(() => {
  subscription?.unsubscribe();
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
</script>

<template>
  <section class="mx-auto flex w-full max-w-5xl flex-col gap-6 py-12">
    <header>
      <h1 class="text-3xl font-bold">Recent exercises</h1>
      <p class="text-base-content/60">
        Showing the latest 100 additions with mode, timing, and evaluation data.
      </p>
    </header>

    <div v-if="entries.length" class="grid gap-4 md:grid-cols-2">
      <article
        v-for="entry in entries"
        :key="entry.exercise.id"
        class="card border border-base-300 bg-base-100 shadow"
      >
        <div class="card-body space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="text-2xl font-black">
              {{ entry.exercise.operandA }} + {{ entry.exercise.operandB }}
            </h2>
            <span
              class="badge"
              :class="
                entry.exercise.mode === 'serious'
                  ? 'badge-error'
                  : 'badge-neutral'
              "
            >
              {{ entry.exercise.mode.toUpperCase() }}
            </span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-sm text-base-content/70">
            <div>
              <p class="font-semibold uppercase tracking-wide">Shown</p>
              <p>{{ formatTimestamp(entry.exercise.displayedAt) }}</p>
            </div>
            <div>
              <p class="font-semibold uppercase tracking-wide">Solved</p>
              <p>{{ formatTimestamp(entry.exercise.solvedAt) }}</p>
            </div>
            <div>
              <p class="font-semibold uppercase tracking-wide">Duration</p>
              <p>{{ formatDuration(entry.exercise) }}</p>
            </div>
            <div>
              <p class="font-semibold uppercase tracking-wide">Events</p>
              <p>{{ entry.eventCount }}</p>
            </div>
          </div>
          <div
            v-if="entry.evaluation"
            class="rounded-lg bg-primary/10 p-3 text-sm"
          >
            <p class="font-semibold">
              Effort rating: {{ entry.evaluation.rating }}
            </p>
            <p class="text-base-content/70">
              Scope: {{ entry.evaluation.scope }}
            </p>
          </div>
          <div v-else class="text-sm text-base-content/60">
            No evaluation captured
          </div>
        </div>
      </article>
    </div>
    <div
      v-else
      class="rounded-2xl border border-dashed border-base-300 p-10 text-center text-base-content/60"
    >
      No exercise data yet. Complete a few exercises to see logs here.
    </div>
  </section>
</template>
