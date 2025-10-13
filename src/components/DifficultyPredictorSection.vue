<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ExerciseRecord, EvaluationRecord, ExerciseMode } from '@/db';
import { useDifficultyCalculation, type DifficultyWeights } from '@/composables/useDifficultyCalculation';
import { useOutlierDetection, type DataPoint } from '@/composables/useOutlierDetection';
import { useCorrelationStats } from '@/composables/useCorrelationStats';
import CorrelationScatterPlot from './CorrelationScatterPlot.vue';
import CorrelationStatsCard from './CorrelationStatsCard.vue';
import BucketedSuccessRateChart from './BucketedSuccessRateChart.vue';

interface Props {
  exercises: ExerciseRecord[];
  evaluations: EvaluationRecord[];
  modeFilter: ExerciseMode | 'all';
}

const props = defineProps<Props>();

const {
  calculateDifficultyScore,
  normalizeDifficulty,
  useDifficultyRange,
} = useDifficultyCalculation();

const { applyOutlierDetection } = useOutlierDetection();
const { calculateCorrelation, calculateRSquared } = useCorrelationStats();

// State
const difficultyWeights = ref<DifficultyWeights>({
  digits: 1.0,
  carryovers: 2.5,
  zeros: 0.5,
});
const detectOutliers = ref(true);
const excludeOutliers = ref(false);
const outlierSensitivity = ref(1.5);

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

  return applyOutlierDetection(points, outlierSensitivity.value, detectOutliers.value);
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

  return applyOutlierDetection(points, outlierSensitivity.value, detectOutliers.value);
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

  return applyOutlierDetection(points, outlierSensitivity.value, detectOutliers.value);
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

  // Fill buckets with data
  difficultyVsCorrectness.value.forEach(point => {
    if (point.isOutlier && excludeOutliers.value) return;

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

// Filtered points for correlations
const filteredTimePoints = computed(() =>
  excludeOutliers.value
    ? difficultyVsTime.value.filter(p => !p.isOutlier)
    : difficultyVsTime.value
);

const filteredRatingPoints = computed(() =>
  excludeOutliers.value
    ? difficultyVsRating.value.filter(p => !p.isOutlier)
    : difficultyVsRating.value
);

const filteredCorrectnessPoints = computed(() =>
  excludeOutliers.value
    ? difficultyVsCorrectness.value.filter(p => !p.isOutlier)
    : difficultyVsCorrectness.value
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
  difficultyWeights.value = { digits: 1.0, carryovers: 2.5, zeros: 0.5 };
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

      <!-- Reset Button -->
      <div class="flex justify-end mt-2">
        <button @click="resetWeights" class="btn btn-ghost btn-sm">Reset to Defaults</button>
      </div>

      <!-- Outlier Controls -->
      <div class="divider"></div>
      <div class="flex flex-wrap items-end gap-6">
        <div class="form-control">
          <label class="label cursor-pointer gap-2">
            <input type="checkbox" v-model="detectOutliers" class="checkbox checkbox-sm" />
            <span class="label-text">Detect outliers</span>
          </label>
        </div>

        <div class="form-control">
          <label class="label cursor-pointer gap-2">
            <input
              type="checkbox"
              v-model="excludeOutliers"
              class="checkbox checkbox-sm"
              :disabled="!detectOutliers"
            />
            <span class="label-text">Exclude outliers from correlation</span>
          </label>
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
              :disabled="!detectOutliers"
            />
            <span class="text-sm font-mono">{{ outlierSensitivity.toFixed(1) }}×</span>
          </div>
        </div>
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
          :show-outliers="detectOutliers"
          :exclude-outliers="excludeOutliers"
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
            :show-outliers="detectOutliers"
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
          :show-outliers="detectOutliers"
          :exclude-outliers="excludeOutliers"
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
            :show-outliers="detectOutliers"
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
          :show-outliers="detectOutliers"
          :exclude-outliers="excludeOutliers"
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
