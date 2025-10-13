<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { ExerciseRecord, EvaluationRecord, ExerciseMode } from '@/db';
import { db } from '@/db';
import { useDifficultyCalculation } from '@/composables/useDifficultyCalculation';
import { useOutlierDetection, type DataPoint } from '@/composables/useOutlierDetection';
import { useCorrelationStats } from '@/composables/useCorrelationStats';
import { useWeightOptimization, type OptimizationProgress } from '@/composables/useWeightOptimization';
import CorrelationScatterPlot from './CorrelationScatterPlot.vue';
import CorrelationStatsCard from './CorrelationStatsCard.vue';
import BucketedSuccessRateChart from './BucketedSuccessRateChart.vue';
import type { DifficultyWeights } from '@/types/difficulty';
import { mergeDifficultyWeights } from '@/types/difficulty';

interface Props {
  exercises: ExerciseRecord[];
  evaluations: EvaluationRecord[];
  modeFilter: ExerciseMode | 'all';
  activeUserId: number | null;
}

const props = defineProps<Props>();

const {
  calculateDifficultyScore,
  normalizeDifficulty,
  useDifficultyRange,
} = useDifficultyCalculation();

const { applyOutlierDetection } = useOutlierDetection();
const { calculateCorrelation, calculateRSquared } = useCorrelationStats();
const { gridSearch } = useWeightOptimization();

// State
const difficultyWeights = ref<DifficultyWeights>(mergeDifficultyWeights());
const outlierSensitivity = ref(1.5);

const PERSIST_DEBOUNCE_MS = 300;
let persistTimeout: ReturnType<typeof setTimeout> | null = null;
let isApplyingPersistedWeights = false;

function clearPersistTimer() {
  if (persistTimeout) {
    clearTimeout(persistTimeout);
    persistTimeout = null;
  }
}

function roundWeight(value: number) {
  return Math.round(value * 100) / 100;
}

function toPersistableWeights(weights: DifficultyWeights): DifficultyWeights {
  return {
    digits: roundWeight(weights.digits),
    carryovers: roundWeight(weights.carryovers),
    zeros: roundWeight(weights.zeros),
  };
}

async function loadDifficultyWeights(userId: number) {
  isApplyingPersistedWeights = true;
  try {
    const settings = await db.userSettings.get({ userId });
    const stored = settings?.difficultyWeights;

    difficultyWeights.value = mergeDifficultyWeights(stored);
    await nextTick();
  } finally {
    isApplyingPersistedWeights = false;
  }
}

async function persistDifficultyWeights(userId: number, weights: DifficultyWeights) {
  const now = Date.now();
  const existing = await db.userSettings.get({ userId });
  const payload = toPersistableWeights(weights);

  if (existing) {
    await db.userSettings.update(existing.id!, {
      difficultyWeights: payload,
      updatedAt: now,
    });
  } else {
    await db.userSettings.add({
      userId,
      graduallyIncreaseDifficulty: false,
      progressiveDifficultyActivatedAt: undefined,
      difficultyWeights: payload,
      updatedAt: now,
    });
  }
}

function schedulePersist(weights: DifficultyWeights) {
  const userId = props.activeUserId;
  if (!userId) return;

  const snapshot = toPersistableWeights(weights);
  clearPersistTimer();

  persistTimeout = setTimeout(() => {
    persistTimeout = null;
    void persistDifficultyWeights(userId, snapshot);
  }, PERSIST_DEBOUNCE_MS);
}

watch(
  () => props.activeUserId,
  (userId) => {
    clearPersistTimer();
    if (userId) {
      void loadDifficultyWeights(userId);
    } else {
      isApplyingPersistedWeights = true;
      difficultyWeights.value = mergeDifficultyWeights();
      isApplyingPersistedWeights = false;
    }
  },
  { immediate: true }
);

watch(
  difficultyWeights,
  (weights) => {
    if (!props.activeUserId || isApplyingPersistedWeights) return;
    schedulePersist({ ...weights });
  },
  { deep: true }
);

onBeforeUnmount(() => {
  clearPersistTimer();
});

// Optimization state
const isOptimizing = ref(false);
const optimizationProgress = ref<OptimizationProgress>({ current: 0, total: 0, percentage: 0 });
const beforeOptimization = ref<{
  weights: DifficultyWeights;
  correlations: { cl: number | null; time: number | null; correctness: number | null };
} | null>(null);

// Difficulty range for normalization
const difficultyRange = useDifficultyRange(
  computed(() => props.exercises),
  difficultyWeights,
  computed(() => props.modeFilter)
);

// Difficulty vs Time data points
const difficultyVsTime = computed<DataPoint[]>(() => {
  const points: DataPoint[] = [];

  props.exercises.forEach(ex => {
    if (!ex.solvedAt || !ex.id) return;
    if (props.modeFilter !== 'all' && ex.mode !== props.modeFilter) return;

    const duration = (ex.solvedAt - ex.displayedAt) / 1000;
    if (duration < 0.5 || duration > 120) return;

    const rawDifficulty = calculateDifficultyScore(ex, difficultyWeights.value);
    const difficulty = normalizeDifficulty(rawDifficulty, difficultyRange.value);

    points.push({ x: difficulty, y: duration, isOutlier: false });
  });

  return applyOutlierDetection(points, outlierSensitivity.value, true);
});

// Difficulty vs CL Rating data points
const difficultyVsRating = computed<DataPoint[]>(() => {
  const points: DataPoint[] = [];

  // Build rating map
  const ratingMap = new Map<number, number[]>();
  props.evaluations.forEach(evaluation => {
    if (props.modeFilter !== 'all' && evaluation.mode !== props.modeFilter) return;
    if (evaluation.rating < 1 || evaluation.rating > 9) return;

    evaluation.exerciseIds.forEach(exerciseId => {
      if (!ratingMap.has(exerciseId)) {
        ratingMap.set(exerciseId, []);
      }
      ratingMap.get(exerciseId)!.push(evaluation.rating);
    });
  });

  props.exercises.forEach(ex => {
    if (!ex.id) return;
    const ratings = ratingMap.get(ex.id);
    if (!ratings || ratings.length === 0) return;

    const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;

    const rawDifficulty = calculateDifficultyScore(ex, difficultyWeights.value);
    const difficulty = normalizeDifficulty(rawDifficulty, difficultyRange.value);

    points.push({ x: difficulty, y: avgRating, isOutlier: false });
  });

  return applyOutlierDetection(points, outlierSensitivity.value, true);
});

// Difficulty vs Correctness data points
const difficultyVsCorrectness = computed<DataPoint[]>(() => {
  const points: DataPoint[] = [];

  props.exercises.forEach(ex => {
    if (!ex.id || ex.keystrokeCount === undefined) return;
    if (props.modeFilter !== 'all' && ex.mode !== props.modeFilter) return;

    const optimal = ex.answer.toString().length;
    const efficiency = (ex.keystrokeCount / optimal) * 100;

    if (efficiency < 100 || efficiency > 500) return;

    const rawDifficulty = calculateDifficultyScore(ex, difficultyWeights.value);
    const difficulty = normalizeDifficulty(rawDifficulty, difficultyRange.value);

    // Binary outcome: 1 = correct (100% efficiency), 0 = incorrect
    const isCorrect = efficiency === 100 ? 1 : 0;

    points.push({ x: difficulty, y: isCorrect, isOutlier: false });
  });

  // Only detect outliers on X-axis (difficulty) for binary data, not Y-axis
  if (points.length >= 4) {
    const xValues = points.map(p => p.x);
    const { detectOutliersIQR } = useOutlierDetection();
    const xOutliers = detectOutliersIQR(xValues, outlierSensitivity.value);

    points.forEach((point, idx) => {
      point.isOutlier = xOutliers.has(idx);
    });
  }

  return points;
});

// Bucketed success rate data
interface BucketData {
  bucket: string;
  successRate: number;
  totalCount: number;
  correctCount: number;
}

const difficultyBuckets = computed<BucketData[]>(() => {
  const buckets: Map<number, { correct: number; total: number }> = new Map();

  // Initialize 20 buckets (0-5, 5-10, ..., 95-100)
  for (let i = 0; i < 20; i++) {
    buckets.set(i, { correct: 0, total: 0 });
  }

  // Fill buckets with data (exclude outliers)
  difficultyVsCorrectness.value.forEach(point => {
    if (point.isOutlier) return;

    const bucketIndex = Math.min(Math.floor(point.x / 5), 19);
    const bucket = buckets.get(bucketIndex)!;
    bucket.total++;
    if (point.y === 1) bucket.correct++;
  });

  // Convert to array format
  const result: BucketData[] = [];
  for (let i = 0; i < 20; i++) {
    const bucket = buckets.get(i)!;
    if (bucket.total > 0) {
      result.push({
        bucket: `${i * 5}-${(i + 1) * 5}`,
        successRate: (bucket.correct / bucket.total) * 100,
        totalCount: bucket.total,
        correctCount: bucket.correct,
      });
    }
  }

  return result;
});

// Filtered points for correlations (always exclude outliers)
const filteredTimePoints = computed(() =>
  difficultyVsTime.value.filter(p => !p.isOutlier)
);

const filteredRatingPoints = computed(() =>
  difficultyVsRating.value.filter(p => !p.isOutlier)
);

const filteredCorrectnessPoints = computed(() =>
  difficultyVsCorrectness.value.filter(p => !p.isOutlier)
);

// Correlations
const timeCorr = computed(() => calculateCorrelation(filteredTimePoints.value));
const timeR2 = computed(() => calculateRSquared(filteredTimePoints.value));
const timeOutlierCount = computed(() => difficultyVsTime.value.filter(p => p.isOutlier).length);

const ratingCorr = computed(() => calculateCorrelation(filteredRatingPoints.value));
const ratingR2 = computed(() => calculateRSquared(filteredRatingPoints.value));
const ratingOutlierCount = computed(() => difficultyVsRating.value.filter(p => p.isOutlier).length);

const correctnessCorr = computed(() => calculateCorrelation(filteredCorrectnessPoints.value));
const correctnessOutlierCount = computed(() => difficultyVsCorrectness.value.filter(p => p.isOutlier).length);
const correctnessPercent = computed(() => {
  const total = filteredCorrectnessPoints.value.length;
  if (total === 0) return 0;
  const correct = filteredCorrectnessPoints.value.filter(p => p.y === 1).length;
  return (correct / total) * 100;
});

function resetWeights() {
  difficultyWeights.value = mergeDifficultyWeights();
}

// Auto-optimize weights
async function autoOptimize() {
  if (isOptimizing.value) return;

  // Save current state
  beforeOptimization.value = {
    weights: { ...difficultyWeights.value },
    correlations: {
      cl: ratingCorr.value,
      time: timeCorr.value,
      correctness: correctnessCorr.value,
    },
  };

  isOptimizing.value = true;
  optimizationProgress.value = { current: 0, total: 0, percentage: 0 };

  try {
    const result = await gridSearch(
      props.exercises,
      props.evaluations,
      props.modeFilter,
      true, // always detect outliers
      outlierSensitivity.value,
      (progress) => {
        optimizationProgress.value = progress;
      }
    );

    // Apply optimized weights
    difficultyWeights.value = result.weights;

    // Show result summary
    showOptimizationResult(result);
  } catch (error) {
    console.error('Optimization failed:', error);
    alert('Optimization failed. Please try again.');
  } finally {
    isOptimizing.value = false;
  }
}

function showOptimizationResult(result: any) {
  const before = beforeOptimization.value;
  if (!before) return;

  const improvements = [];

  if (before.correlations.cl !== null && result.correlations.cl !== null) {
    const change = result.correlations.cl - before.correlations.cl;
    improvements.push(`CL: ${before.correlations.cl.toFixed(3)} → ${result.correlations.cl.toFixed(3)} (${change >= 0 ? '+' : ''}${change.toFixed(3)})`);
  }

  if (before.correlations.time !== null && result.correlations.time !== null) {
    const change = result.correlations.time - before.correlations.time;
    improvements.push(`Time: ${before.correlations.time.toFixed(3)} → ${result.correlations.time.toFixed(3)} (${change >= 0 ? '+' : ''}${change.toFixed(3)})`);
  }

  if (before.correlations.correctness !== null && result.correlations.correctness !== null) {
    const change = Math.abs(result.correlations.correctness) - Math.abs(before.correlations.correctness);
    improvements.push(`Correctness: ${before.correlations.correctness.toFixed(3)} → ${result.correlations.correctness.toFixed(3)} (${change >= 0 ? '+' : ''}${change.toFixed(3)})`);
  }

  const message = `Optimization Complete!\n\nNew weights:\nDigits: ${result.weights.digits.toFixed(1)}\nCarryovers: ${result.weights.carryovers.toFixed(1)}\nZeros: ${result.weights.zeros.toFixed(1)}\n\nCorrelations:\n${improvements.join('\n')}`;

  alert(message);
}
</script>

<template>
  <div v-if="exercises.length > 10" class="card border border-base-300 bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title text-lg">🎯 Difficulty Predictor</h2>
      <p class="text-sm text-base-content/60">
        Adjust feature weights and observe correlation with actual performance metrics
      </p>

      <!-- Weight Sliders -->
      <div class="grid gap-4 md:grid-cols-3 mt-4">
        <div class="form-control">
          <label class="label">
            <span class="label-text font-semibold">Digits Weight</span>
            <span class="label-text-alt font-mono">{{ difficultyWeights.digits.toFixed(1) }}</span>
          </label>
          <input
            type="range"
            v-model.number="difficultyWeights.digits"
            min="0"
            max="5"
            step="0.1"
            class="range range-primary range-sm"
          />
          <div class="text-xs text-base-content/60 mt-1">Impact of total digit count</div>
        </div>

        <div class="form-control">
          <label class="label">
            <span class="label-text font-semibold">Carryovers Weight</span>
            <span class="label-text-alt font-mono">{{ difficultyWeights.carryovers.toFixed(1) }}</span>
          </label>
          <input
            type="range"
            v-model.number="difficultyWeights.carryovers"
            min="0"
            max="10"
            step="0.1"
            class="range range-primary range-sm"
          />
          <div class="text-xs text-base-content/60 mt-1">Impact of carry operations</div>
        </div>

        <div class="form-control">
          <label class="label">
            <span class="label-text font-semibold">Zeros Weight</span>
            <span class="label-text-alt font-mono">{{ difficultyWeights.zeros.toFixed(1) }}</span>
          </label>
          <input
            type="range"
            v-model.number="difficultyWeights.zeros"
            min="0"
            max="5"
            step="0.1"
            class="range range-primary range-sm"
          />
          <div class="text-xs text-base-content/60 mt-1">Reduction from zeros (easier)</div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex justify-end gap-2 mt-2">
        <button @click="resetWeights" class="btn btn-ghost btn-sm">Reset to Defaults</button>

        <!-- Auto-Optimize Button or Progress Bar -->
        <button
          v-if="!isOptimizing"
          @click="autoOptimize"
          class="btn btn-primary btn-sm"
          :disabled="exercises.length < 30"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Auto-Optimize
        </button>

        <!-- Progress Bar -->
        <div v-else class="flex items-center gap-2">
          <progress
            class="progress progress-primary w-32"
            :value="optimizationProgress.percentage"
            max="100"
          ></progress>
          <span class="text-xs font-mono">{{ optimizationProgress.percentage.toFixed(0) }}%</span>
        </div>
      </div>

      <!-- Warning for insufficient data -->
      <div v-if="exercises.length < 30" class="alert alert-warning mt-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        <span class="text-xs">Need at least 30 exercises for reliable optimization (current: {{ exercises.length }})</span>
      </div>
    </div>
  </div>

  <!-- Difficulty Correlation Results and Charts (2x2 Grid, but only 3 charts) -->
  <div v-if="difficultyVsTime.length > 0" class="grid gap-6 md:grid-cols-2">
    <!-- Solve Time -->
    <div class="space-y-4">
      <div class="flex flex-col gap-2">
        <h3 class="text-lg font-bold">vs Solve Time</h3>
        <CorrelationStatsCard
          :correlation="timeCorr"
          :r2="timeR2"
          :outlier-count="timeOutlierCount"
        />
      </div>
      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body p-3">
          <CorrelationScatterPlot
            :points="difficultyVsTime"
            title="Predicted Difficulty vs Solve Time"
            x-axis-label="Predicted Difficulty (0-100)"
            y-axis-label="Solve Time (seconds)"
            :x-min="0"
            :x-max="100"
            :y-min="0"
            normal-color="rgba(59, 130, 246, 0.5)"
            :tooltip-formatter="(x, y) => `Difficulty: ${x.toFixed(1)}, Time: ${y.toFixed(2)}s`"
          />
        </div>
      </div>
    </div>

    <!-- CL Rating -->
    <div class="space-y-4">
      <div class="flex flex-col gap-2">
        <h3 class="text-lg font-bold">vs CL Rating</h3>
        <CorrelationStatsCard
          :correlation="ratingCorr"
          :r2="ratingR2"
          :outlier-count="ratingOutlierCount"
        />
      </div>
      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body p-3">
          <CorrelationScatterPlot
            :points="difficultyVsRating"
            title="Predicted Difficulty vs CL Rating"
            x-axis-label="Predicted Difficulty (0-100)"
            y-axis-label="CL Rating (1-9)"
            :x-min="0"
            :x-max="100"
            :y-min="0"
            :y-max="10"
            :y-step-size="1"
            normal-color="rgba(168, 85, 247, 0.5)"
            :tooltip-formatter="(x, y) => `Difficulty: ${x.toFixed(1)}, Rating: ${y.toFixed(1)}`"
          />
        </div>
      </div>
    </div>

    <!-- Correctness (Bucketed Bar Chart) -->
    <div v-if="difficultyVsCorrectness.length > 0" class="space-y-4 md:col-span-2">
      <div class="flex flex-col gap-2">
        <h3 class="text-lg font-bold">vs Correctness</h3>
        <CorrelationStatsCard
          :correlation="correctnessCorr"
          :outlier-count="correctnessOutlierCount"
          stat-label="Point-Biserial r"
          :description="`${correctnessPercent.toFixed(1)}% correct`"
        />
      </div>
      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body p-3">
          <BucketedSuccessRateChart
            v-if="difficultyBuckets.length > 0"
            :buckets="difficultyBuckets"
            title="Success Rate by Predicted Difficulty"
            x-axis-label="Difficulty Range (0-100)"
            y-axis-label="Success Rate (%)"
            height="400px"
          />
          <div v-else class="text-center text-base-content/60 py-8">
            No bucketed data available
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
