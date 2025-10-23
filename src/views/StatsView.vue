<script setup lang="ts">
import { onUnmounted, ref, computed } from "vue";
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
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { BoxPlotController, BoxAndWiskers } from '@sgratzl/chartjs-chart-boxplot';
import { Chart } from 'vue-chartjs';
import DifficultyPredictorSection from "@/components/DifficultyPredictorSection.vue";
import CognitiveLoadCorrelations from "@/components/CognitiveLoadCorrelations.vue";

ChartJS.register(CategoryScale, LinearScale, PointElement, BarElement, Title, Tooltip, Legend, BoxPlotController, BoxAndWiskers);

const { activeUserId } = useActiveUser();

const evaluations = ref<EvaluationRecord[]>([]);
const exercises = ref<ExerciseRecord[]>([]);
const modeFilter = ref<ExerciseMode | "all">("all");
const outlierSensitivity = ref(1.5);

let subscription: { unsubscribe: () => void } | null = null;

// Subscribe to data changes
function subscribeToData(userId: number) {
  subscription?.unsubscribe();
  evaluations.value = [];
  exercises.value = [];

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
}

// Watch for user changes
import { watch } from "vue";
watch(
  () => activeUserId.value,
  (userId) => {
    if (userId !== null) {
      subscribeToData(userId);
    } else {
      subscription?.unsubscribe();
      evaluations.value = [];
      exercises.value = [];
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  subscription?.unsubscribe();
});

// Box plot data
const timeDataForBoxPlot = computed(() => {
  return exercises.value
    .filter(ex => {
      if (!ex.solvedAt) return false;
      if (modeFilter.value !== 'all' && ex.mode !== modeFilter.value) return false;
      const duration = (ex.solvedAt - ex.displayedAt) / 1000;
      return duration >= 0.5 && duration <= 120;
    })
    .map(ex => (ex.solvedAt! - ex.displayedAt) / 1000);
});

const boxPlotData = computed(() => ({
  labels: ['All Exercises'],
  datasets: [{
    label: 'Time (seconds)',
    data: [timeDataForBoxPlot.value],
    backgroundColor: 'rgba(59, 130, 246, 0.5)',
    borderColor: 'rgba(59, 130, 246, 1)',
    borderWidth: 2,
    outlierColor: 'rgba(239, 68, 68, 0.8)',
    padding: 10,
    itemRadius: 3,
  }],
}));

const boxPlotOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    title: {
      display: false,
    },
  },
  scales: {
    y: {
      title: {
        display: true,
        text: 'Time (seconds)',
        font: { size: 14 },
      },
      min: 0,
    },
  },
}));
</script>

<template>
  <section class="mx-auto flex w-full max-w-6xl flex-col gap-6 py-12">
    <header>
      <h1 class="text-3xl font-bold">Statistics</h1>
      <p class="text-base-content/60">
        Correlation analysis between cognitive load and typing efficiency
      </p>
    </header>

    <div class="card border border-base-300 bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title text-lg">Analysis Settings</h2>
        <div class="flex flex-wrap items-end gap-6">
          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">Mode</span>
            </label>
            <select v-model="modeFilter" class="select select-bordered select-sm">
              <option value="all">All modes</option>
              <option value="self-paced">Self-Paced only</option>
              <option value="timed">Timed only</option>
            </select>
          </div>

          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">Outlier sensitivity</span>
            </label>
            <div class="flex items-center gap-2">
              <input
                type="range"
                v-model.number="outlierSensitivity"
                min="1.0"
                max="3.0"
                step="0.1"
                class="range range-sm range-primary"
                style="width: 150px"
              />
              <span class="text-sm font-mono">{{ outlierSensitivity.toFixed(1) }}×</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Difficulty Predictor Section -->
    <DifficultyPredictorSection
      :exercises="exercises"
      :evaluations="evaluations"
      :mode-filter="modeFilter"
      :active-user-id="activeUserId"
    />

    <!-- Cognitive Load Correlations Section -->
    <CognitiveLoadCorrelations
      :exercises="exercises"
      :evaluations="evaluations"
      :mode-filter="modeFilter"
    />

    <!-- Time Distribution Box Plot -->
    <div v-if="timeDataForBoxPlot.length > 0" class="card border border-base-300 bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title text-lg">Exercise Time Distribution</h2>
        <div style="height: 400px">
          <Chart type="boxplot" :data="boxPlotData" :options="boxPlotOptions" />
        </div>
      </div>
    </div>

    <div
      v-if="evaluations.length === 0 && exercises.length === 0"
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
