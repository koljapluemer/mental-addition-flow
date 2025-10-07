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
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Scatter } from "vue-chartjs";

ChartJS.register(CategoryScale, LinearScale, PointElement, Title, Tooltip, Legend);

const { activeUserId } = useActiveUser();

interface DataPoint {
  x: number; // keystroke efficiency percentage
  y: number; // effort rating
}

const evaluations = ref<EvaluationRecord[]>([]);
const exercises = ref<ExerciseRecord[]>([]);
const modeFilter = ref<ExerciseMode | "all">("all");
let subscription: { unsubscribe: () => void } | null = null;

watch(
  () => activeUserId.value,
  (userId) => {
    subscription?.unsubscribe();
    evaluations.value = [];
    exercises.value = [];

    if (!userId) {
      return;
    }

    subscription = liveQuery(async () => {
      const evals = await db.evaluations
        .where("userId")
        .equals(userId)
        .reverse()
        .limit(200)
        .toArray();

      const exs = await db.exercises
        .where("[userId+displayedAt]")
        .between([userId, Dexie.minKey], [userId, Dexie.maxKey])
        .reverse()
        .limit(500)
        .toArray();

      return { evals, exs };
    }).subscribe({
      next(data) {
        if (data) {
          evaluations.value = data.evals;
          exercises.value = data.exs;
        }
      },
    });
  },
  { immediate: true },
);

onUnmounted(() => {
  subscription?.unsubscribe();
});

const dataPoints = computed<DataPoint[]>(() => {
  const points: DataPoint[] = [];
  const exerciseMap = new Map<number, ExerciseRecord>();

  exercises.value.forEach((ex) => {
    if (ex.id) {
      exerciseMap.set(ex.id, ex);
    }
  });

  for (const evaluation of evaluations.value) {
    // Filter by mode if needed
    if (modeFilter.value !== "all" && evaluation.mode !== modeFilter.value) {
      continue;
    }

    // For each exercise in this evaluation
    for (const exerciseId of evaluation.exerciseIds) {
      const exercise = exerciseMap.get(exerciseId);
      if (!exercise || exercise.keystrokeCount === undefined) {
        continue;
      }

      const optimal = exercise.answer.toString().length;
      const efficiency = (exercise.keystrokeCount / optimal) * 100;

      points.push({
        x: efficiency,
        y: evaluation.rating,
      });
    }
  }

  return points;
});

const timeDataPoints = computed<DataPoint[]>(() => {
  const points: DataPoint[] = [];
  const exerciseMap = new Map<number, ExerciseRecord>();

  exercises.value.forEach((ex) => {
    if (ex.id) {
      exerciseMap.set(ex.id, ex);
    }
  });

  for (const evaluation of evaluations.value) {
    // Filter by mode if needed
    if (modeFilter.value !== "all" && evaluation.mode !== modeFilter.value) {
      continue;
    }

    // For each exercise in this evaluation
    for (const exerciseId of evaluation.exerciseIds) {
      const exercise = exerciseMap.get(exerciseId);
      if (!exercise || !exercise.solvedAt) {
        continue;
      }

      const duration = (exercise.solvedAt - exercise.displayedAt) / 1000; // in seconds

      points.push({
        x: duration,
        y: evaluation.rating,
      });
    }
  }

  return points;
});

const chartData = computed(() => ({
  datasets: [
    {
      label: "Effort Rating vs Keystroke Efficiency",
      data: dataPoints.value,
      backgroundColor: "rgba(59, 130, 246, 0.5)",
      borderColor: "rgba(59, 130, 246, 0.8)",
      pointRadius: 6,
      pointHoverRadius: 8,
    },
  ],
}));

const timeChartData = computed(() => ({
  datasets: [
    {
      label: "Effort Rating vs Solve Time",
      data: timeDataPoints.value,
      backgroundColor: "rgba(16, 185, 129, 0.5)",
      borderColor: "rgba(16, 185, 129, 0.8)",
      pointRadius: 6,
      pointHoverRadius: 8,
    },
  ],
}));

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    title: {
      display: true,
      text: "Cognitive Load vs Typing Efficiency",
      font: {
        size: 18,
      },
    },
    tooltip: {
      callbacks: {
        label: (context: any) => {
          return `Rating: ${context.parsed.y}, Efficiency: ${context.parsed.x.toFixed(1)}%`;
        },
      },
    },
  },
  scales: {
    x: {
      title: {
        display: true,
        text: "Keystroke Efficiency (%)",
        font: {
          size: 14,
        },
      },
      min: 80,
      max: 300,
    },
    y: {
      title: {
        display: true,
        text: "Effort Rating (1-9)",
        font: {
          size: 14,
        },
      },
      min: 0,
      max: 10,
      ticks: {
        stepSize: 1,
      },
    },
  },
}));

const timeChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    title: {
      display: true,
      text: "Cognitive Load vs Solve Time",
      font: {
        size: 18,
      },
    },
    tooltip: {
      callbacks: {
        label: (context: any) => {
          return `Rating: ${context.parsed.y}, Time: ${context.parsed.x.toFixed(2)}s`;
        },
      },
    },
  },
  scales: {
    x: {
      title: {
        display: true,
        text: "Solve Time (seconds)",
        font: {
          size: 14,
        },
      },
      min: 0,
    },
    y: {
      title: {
        display: true,
        text: "Effort Rating (1-9)",
        font: {
          size: 14,
        },
      },
      min: 0,
      max: 10,
      ticks: {
        stepSize: 1,
      },
    },
  },
}));

const correlationCoefficient = computed(() => {
  const points = dataPoints.value;
  if (points.length < 2) return null;

  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumX2 = points.reduce((sum, p) => sum + p.x * p.x, 0);
  const sumY2 = points.reduce((sum, p) => sum + p.y * p.y, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return null;
  return numerator / denominator;
});

const timeCorrelationCoefficient = computed(() => {
  const points = timeDataPoints.value;
  if (points.length < 2) return null;

  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumX2 = points.reduce((sum, p) => sum + p.x * p.x, 0);
  const sumY2 = points.reduce((sum, p) => sum + p.y * p.y, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return null;
  return numerator / denominator;
});
</script>

<template>
  <section class="mx-auto flex w-full max-w-6xl flex-col gap-6 py-12">
    <header>
      <h1 class="text-3xl font-bold">Statistics</h1>
      <p class="text-base-content/60">
        Correlation analysis between cognitive load and typing efficiency
      </p>
    </header>

    <div class="flex flex-wrap items-center gap-4">
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
    </div>

    <div v-if="dataPoints.length > 0" class="grid gap-6 md:grid-cols-2">
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold">Typing Efficiency</h2>
          <div v-if="correlationCoefficient !== null" class="stats stats-vertical shadow lg:stats-horizontal">
            <div class="stat p-4">
              <div class="stat-title text-xs">Correlation</div>
              <div class="stat-value text-xl">
                {{ correlationCoefficient.toFixed(3) }}
              </div>
              <div class="stat-desc text-xs">
                {{
                  Math.abs(correlationCoefficient) < 0.3
                    ? "Weak"
                    : Math.abs(correlationCoefficient) < 0.7
                      ? "Moderate"
                      : "Strong"
                }}
              </div>
            </div>
          </div>
        </div>
        <div class="card border border-base-300 bg-base-100 shadow">
          <div class="card-body">
            <div style="height: 400px">
              <Scatter :data="chartData" :options="chartOptions" />
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold">Solve Time</h2>
          <div v-if="timeCorrelationCoefficient !== null" class="stats stats-vertical shadow lg:stats-horizontal">
            <div class="stat p-4">
              <div class="stat-title text-xs">Correlation</div>
              <div class="stat-value text-xl">
                {{ timeCorrelationCoefficient.toFixed(3) }}
              </div>
              <div class="stat-desc text-xs">
                {{
                  Math.abs(timeCorrelationCoefficient) < 0.3
                    ? "Weak"
                    : Math.abs(timeCorrelationCoefficient) < 0.7
                      ? "Moderate"
                      : "Strong"
                }}
              </div>
            </div>
          </div>
        </div>
        <div class="card border border-base-300 bg-base-100 shadow">
          <div class="card-body">
            <div style="height: 400px">
              <Scatter :data="timeChartData" :options="timeChartOptions" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-else
      class="rounded-2xl border border-dashed border-base-300 p-10 text-center text-base-content/60"
    >
      No data available. Complete some exercises with effort ratings to see statistics.
    </div>

    <div class="card border border-base-300 bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title">Interpretation</h2>
        <ul class="list-inside list-disc space-y-2 text-sm">
          <li>
            <strong>X-axis (Keystroke Efficiency):</strong> 100% means perfect typing
            (no corrections), 200% means twice as many keystrokes as needed
          </li>
          <li>
            <strong>Y-axis (Effort Rating):</strong> 1 = very low effort, 9 = very high
            effort
          </li>
          <li>
            <strong>Positive correlation:</strong> More corrections → higher cognitive
            load
          </li>
          <li>
            <strong>Negative correlation:</strong> More corrections → lower cognitive
            load (unexpected)
          </li>
          <li>
            <strong>No correlation:</strong> Typing efficiency and cognitive load are
            independent
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
