<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ExerciseRecord, EvaluationRecord, ExerciseMode } from '@/db';
import { useOutlierDetection, type DataPoint } from '@/composables/useOutlierDetection';
import { useCorrelationStats } from '@/composables/useCorrelationStats';
import CorrelationScatterPlot from './CorrelationScatterPlot.vue';

interface Props {
  exercises: ExerciseRecord[];
  evaluations: EvaluationRecord[];
  modeFilter: ExerciseMode | 'all';
}

const props = defineProps<Props>();

const { applyOutlierDetection } = useOutlierDetection();
const { calculateCorrelation, getCorrelationStrength } = useCorrelationStats();

// State
const detectOutliers = ref(true);
const excludeOutliers = ref(false);
const outlierSensitivity = ref(1.5);

// CL vs Keystroke Efficiency data points
const efficiencyDataPoints = computed<DataPoint[]>(() => {
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

      points.push({
        x: efficiency,
        y: evaluation.rating,
        isOutlier: false,
      });
    }
  }

  return applyOutlierDetection(points, outlierSensitivity.value, detectOutliers.value);
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

  return applyOutlierDetection(points, outlierSensitivity.value, detectOutliers.value);
});

// Filtered points for correlations
const filteredEfficiencyPoints = computed(() =>
  excludeOutliers.value
    ? efficiencyDataPoints.value.filter(p => !p.isOutlier)
    : efficiencyDataPoints.value
);

const filteredTimePoints = computed(() =>
  excludeOutliers.value
    ? timeDataPoints.value.filter(p => !p.isOutlier)
    : timeDataPoints.value
);

// Correlations
const efficiencyCorrelation = computed(() => calculateCorrelation(filteredEfficiencyPoints.value));
const efficiencyCorrelationWithoutOutliers = computed(() =>
  calculateCorrelation(efficiencyDataPoints.value.filter(p => !p.isOutlier))
);
const efficiencyOutlierCount = computed(() => efficiencyDataPoints.value.filter(p => p.isOutlier).length);

const timeCorrelation = computed(() => calculateCorrelation(filteredTimePoints.value));
const timeCorrelationWithoutOutliers = computed(() =>
  calculateCorrelation(timeDataPoints.value.filter(p => !p.isOutlier))
);
const timeOutlierCount = computed(() => timeDataPoints.value.filter(p => p.isOutlier).length);
</script>

<template>
  <div v-if="efficiencyDataPoints.length > 0" class="grid gap-6 md:grid-cols-2">
    <!-- Typing Efficiency -->
    <div class="space-y-4">
      <div class="flex flex-col gap-2">
        <h2 class="text-xl font-bold">Typing Efficiency</h2>
        <div v-if="efficiencyCorrelation !== null" class="space-y-2">
          <div class="stats stats-vertical shadow lg:stats-horizontal">
            <div class="stat p-3">
              <div class="stat-title text-xs">
                {{ excludeOutliers ? 'Correlation (Filtered)' : 'Correlation (All Data)' }}
              </div>
              <div class="stat-value text-xl">
                {{ efficiencyCorrelation.toFixed(3) }}
              </div>
              <div class="stat-desc text-xs">
                {{ getCorrelationStrength(efficiencyCorrelation) }}
              </div>
            </div>
            <div class="stat p-3">
              <div class="stat-title text-xs">Sample Size</div>
              <div class="stat-value text-xl">
                {{ filteredEfficiencyPoints.length }}
              </div>
              <div class="stat-desc text-xs">data points</div>
            </div>
          </div>
          <div
            v-if="detectOutliers && efficiencyOutlierCount > 0 && !excludeOutliers"
            class="text-sm text-base-content/70"
          >
            <div class="flex gap-4">
              <span
                >Without outliers:
                <strong>{{ efficiencyCorrelationWithoutOutliers?.toFixed(3) ?? 'N/A' }}</strong></span
              >
              <span class="text-warning"
                >{{ efficiencyOutlierCount }} outlier{{ efficiencyOutlierCount > 1 ? 's' : '' }}
                detected</span
              >
            </div>
          </div>
        </div>
      </div>
      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body">
          <CorrelationScatterPlot
            :points="efficiencyDataPoints"
            title="Cognitive Load vs Typing Efficiency"
            x-axis-label="Keystroke Efficiency (%)"
            y-axis-label="Effort Rating (1-9)"
            :x-min="80"
            :x-max="300"
            :y-min="0"
            :y-max="10"
            :y-step-size="1"
            :show-outliers="detectOutliers"
            height="400px"
            :tooltip-formatter="(x, y) => `Rating: ${y}, Efficiency: ${x.toFixed(1)}%`"
          />
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
              <div class="stat-title text-xs">
                {{ excludeOutliers ? 'Correlation (Filtered)' : 'Correlation (All Data)' }}
              </div>
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
            v-if="detectOutliers && timeOutlierCount > 0 && !excludeOutliers"
            class="text-sm text-base-content/70"
          >
            <div class="flex gap-4">
              <span
                >Without outliers:
                <strong>{{ timeCorrelationWithoutOutliers?.toFixed(3) ?? 'N/A' }}</strong></span
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
            :show-outliers="detectOutliers"
            height="400px"
            normal-color="rgba(16, 185, 129, 0.5)"
            :tooltip-formatter="(x, y) => `Rating: ${y}, Time: ${x.toFixed(2)}s`"
          />
        </div>
      </div>
    </div>
  </div>

  <!-- Analysis Settings (exposed as prop bindings) -->
  <template v-if="$slots.settings">
    <slot
      name="settings"
      :detect-outliers="detectOutliers"
      :exclude-outliers="excludeOutliers"
      :outlier-sensitivity="outlierSensitivity"
      @update:detect-outliers="detectOutliers = $event"
      @update:exclude-outliers="excludeOutliers = $event"
      @update:outlier-sensitivity="outlierSensitivity = $event"
    />
  </template>
</template>
