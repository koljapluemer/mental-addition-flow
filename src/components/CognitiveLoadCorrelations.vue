<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ExerciseRecord, EvaluationRecord, ExerciseMode } from '@/db';
import { useOutlierDetection, type DataPoint } from '@/composables/useOutlierDetection';
import { useCorrelationStats } from '@/composables/useCorrelationStats';
import CorrelationScatterPlot from './CorrelationScatterPlot.vue';
import BucketedSuccessRateChart from './BucketedSuccessRateChart.vue';

interface Props {
  exercises: ExerciseRecord[];
  evaluations: EvaluationRecord[];
  modeFilter: ExerciseMode | 'all';
}

const props = defineProps<Props>();

const { applyOutlierDetection, detectOutliersIQR } = useOutlierDetection();
const { calculateCorrelation, getCorrelationStrength } = useCorrelationStats();

interface BucketData {
  bucket: string;
  successRate: number;
  totalCount: number;
  correctCount: number;
}

// State
const outlierSensitivity = ref(1.5);

// CL vs Correctness data points
const correctnessDataPoints = computed<DataPoint[]>(() => {
  const points: DataPoint[] = [];
  const exerciseMap = new Map<number, ExerciseRecord>();

  props.exercises.forEach(ex => {
    if (ex.id) {
      exerciseMap.set(ex.id, ex);
    }
  });

  for (const evaluation of props.evaluations) {
    if (props.modeFilter !== 'all' && evaluation.mode !== props.modeFilter) {
      continue;
    }

    if (evaluation.rating < 1 || evaluation.rating > 9) {
      continue;
    }

    for (const exerciseId of evaluation.exerciseIds) {
      const exercise = exerciseMap.get(exerciseId);
      if (!exercise || exercise.keystrokeCount === undefined) {
        continue;
      }

      const optimal = exercise.answer.toString().length;
      const efficiency = (exercise.keystrokeCount / optimal) * 100;

      if (efficiency < 100 || efficiency > 500) {
        continue;
      }

      // Binary outcome: 1 = correct (100% efficiency), 0 = incorrect
      const isCorrect = efficiency === 100 ? 1 : 0;

      points.push({
        x: evaluation.rating,
        y: isCorrect,
        isOutlier: false,
      });
    }
  }

  // Only detect outliers on X-axis (CL rating) for binary data, not Y-axis
  if (points.length >= 4) {
    const xValues = points.map(p => p.x);
    const xOutliers = detectOutliersIQR(xValues, outlierSensitivity.value);

    points.forEach((point, idx) => {
      point.isOutlier = xOutliers.has(idx);
    });
  }

  return points;
});

// CL vs Solve Time data points
const timeDataPoints = computed<DataPoint[]>(() => {
  const points: DataPoint[] = [];
  const exerciseMap = new Map<number, ExerciseRecord>();

  props.exercises.forEach(ex => {
    if (ex.id) {
      exerciseMap.set(ex.id, ex);
    }
  });

  for (const evaluation of props.evaluations) {
    if (props.modeFilter !== 'all' && evaluation.mode !== props.modeFilter) {
      continue;
    }

    if (evaluation.rating < 1 || evaluation.rating > 9) {
      continue;
    }

    for (const exerciseId of evaluation.exerciseIds) {
      const exercise = exerciseMap.get(exerciseId);
      if (!exercise || !exercise.solvedAt) {
        continue;
      }

      const duration = (exercise.solvedAt - exercise.displayedAt) / 1000;

      if (duration < 0.5 || duration > 120) {
        continue;
      }

      points.push({
        x: duration,
        y: evaluation.rating,
        isOutlier: false,
      });
    }
  }

  return applyOutlierDetection(points, outlierSensitivity.value, true);
});

// Bucketed success rate by CL rating
const correctnessBuckets = computed<BucketData[]>(() => {
  const buckets: Map<number, { correct: number; total: number }> = new Map();

  // Initialize 9 buckets (1-9 CL rating)
  for (let i = 1; i <= 9; i++) {
    buckets.set(i, { correct: 0, total: 0 });
  }

  // Fill buckets with data (exclude outliers)
  correctnessDataPoints.value.forEach(point => {
    if (point.isOutlier) return;

    const rating = Math.round(point.x);
    if (rating < 1 || rating > 9) return;

    const bucket = buckets.get(rating)!;
    bucket.total++;
    if (point.y === 1) bucket.correct++;
  });

  // Convert to array format
  const result: BucketData[] = [];
  for (let i = 1; i <= 9; i++) {
    const bucket = buckets.get(i)!;
    if (bucket.total > 0) {
      result.push({
        bucket: String(i),
        successRate: (bucket.correct / bucket.total) * 100,
        totalCount: bucket.total,
        correctCount: bucket.correct,
      });
    }
  }

  return result;
});

// Filtered points for correlations (always exclude outliers)
const filteredCorrectnessPoints = computed(() =>
  correctnessDataPoints.value.filter(p => !p.isOutlier)
);

const filteredTimePoints = computed(() =>
  timeDataPoints.value.filter(p => !p.isOutlier)
);

// Correlations (both with and without outliers)
const correctnessCorrelation = computed(() => calculateCorrelation(filteredCorrectnessPoints.value));
const correctnessCorrelationWithAll = computed(() => calculateCorrelation(correctnessDataPoints.value));
const correctnessOutlierCount = computed(() => correctnessDataPoints.value.filter(p => p.isOutlier).length);

const timeCorrelation = computed(() => calculateCorrelation(filteredTimePoints.value));
const timeCorrelationWithAll = computed(() => calculateCorrelation(timeDataPoints.value));
const timeOutlierCount = computed(() => timeDataPoints.value.filter(p => p.isOutlier).length);
</script>

<template>
  <div v-if="correctnessDataPoints.length > 0" class="grid gap-6 md:grid-cols-2">
    <!-- Correctness -->
    <div class="space-y-4">
      <div class="flex flex-col gap-2">
        <h2 class="text-xl font-bold">Correctness</h2>
        <div v-if="correctnessCorrelation !== null" class="space-y-2">
          <div class="stats stats-vertical shadow lg:stats-horizontal">
            <div class="stat p-3">
              <div class="stat-title text-xs">Point-Biserial r (Filtered)</div>
              <div class="stat-value text-xl">
                {{ correctnessCorrelation.toFixed(3) }}
              </div>
              <div class="stat-desc text-xs">
                {{ getCorrelationStrength(correctnessCorrelation) }}
              </div>
            </div>
            <div class="stat p-3">
              <div class="stat-title text-xs">Sample Size</div>
              <div class="stat-value text-xl">
                {{ filteredCorrectnessPoints.length }}
              </div>
              <div class="stat-desc text-xs">data points</div>
            </div>
          </div>
          <div
            v-if="correctnessOutlierCount > 0"
            class="text-sm text-base-content/70"
          >
            <div class="flex gap-4">
              <span
                >With all data:
                <strong>{{ correctnessCorrelationWithAll?.toFixed(3) ?? 'N/A' }}</strong></span
              >
              <span class="text-warning"
                >{{ correctnessOutlierCount }} outlier{{ correctnessOutlierCount > 1 ? 's' : '' }}
                detected</span
              >
            </div>
          </div>
        </div>
      </div>
      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body">
          <BucketedSuccessRateChart
            v-if="correctnessBuckets.length > 0"
            :buckets="correctnessBuckets"
            title="Success Rate by Cognitive Load"
            x-axis-label="CL Rating (1-9)"
            y-axis-label="Success Rate (%)"
            height="400px"
          />
          <div v-else class="text-center text-base-content/60 py-8">
            No bucketed data available
          </div>
        </div>
      </div>
    </div>

    <!-- Solve Time -->
    <div class="space-y-4">
      <div class="flex flex-col gap-2">
        <h2 class="text-xl font-bold">Solve Time</h2>
        <div v-if="timeCorrelation !== null" class="space-y-2">
          <div class="stats stats-vertical shadow lg:stats-horizontal">
            <div class="stat p-3">
              <div class="stat-title text-xs">Correlation (Filtered)</div>
              <div class="stat-value text-xl">
                {{ timeCorrelation.toFixed(3) }}
              </div>
              <div class="stat-desc text-xs">
                {{ getCorrelationStrength(timeCorrelation) }}
              </div>
            </div>
            <div class="stat p-3">
              <div class="stat-title text-xs">Sample Size</div>
              <div class="stat-value text-xl">
                {{ filteredTimePoints.length }}
              </div>
              <div class="stat-desc text-xs">data points</div>
            </div>
          </div>
          <div
            v-if="timeOutlierCount > 0"
            class="text-sm text-base-content/70"
          >
            <div class="flex gap-4">
              <span
                >With all data:
                <strong>{{ timeCorrelationWithAll?.toFixed(3) ?? 'N/A' }}</strong></span
              >
              <span class="text-warning"
                >{{ timeOutlierCount }} outlier{{ timeOutlierCount > 1 ? 's' : '' }} detected</span
              >
            </div>
          </div>
        </div>
      </div>
      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body">
          <CorrelationScatterPlot
            :points="timeDataPoints"
            title="Cognitive Load vs Solve Time"
            x-axis-label="Solve Time (seconds)"
            y-axis-label="Effort Rating (1-9)"
            :x-min="0"
            :y-min="0"
            :y-max="10"
            :y-step-size="1"
            height="400px"
            normal-color="rgba(16, 185, 129, 0.5)"
            :tooltip-formatter="(x, y) => `Rating: ${y}, Time: ${x.toFixed(2)}s`"
          />
        </div>
      </div>
    </div>
  </div>
</template>
