<script setup lang="ts">
interface Props {
  correlation: number | null;
  r2?: number | null;
  outlierCount?: number;
  statLabel?: string;
  description?: string;
}

withDefaults(defineProps<Props>(), {
  statLabel: 'Correlation',
});

function getCorrelationStrength(corr: number | null): string {
  if (corr === null) return 'Unknown';
  const abs = Math.abs(corr);
  if (abs < 0.3) return 'Weak';
  if (abs < 0.7) return 'Moderate';
  return 'Strong';
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="correlation !== null">
      <div class="stats shadow w-full">
        <div class="stat p-2">
          <div class="stat-title text-xs">{{ statLabel }}</div>
          <div class="stat-value text-lg">{{ correlation.toFixed(3) }}</div>
          <div class="stat-desc text-xs">
            <template v-if="r2 !== undefined && r2 !== null">
              R² = {{ r2.toFixed(3) }}
            </template>
            <template v-else-if="description">
              {{ description }}
            </template>
            <template v-else>
              {{ getCorrelationStrength(correlation) }}
            </template>
          </div>
        </div>
      </div>
      <div
        v-if="outlierCount && outlierCount > 0"
        class="text-sm text-base-content/70 mt-2"
      >
        <span class="text-warning">{{ outlierCount }} outlier(s) excluded</span>
      </div>
    </div>
  </div>
</template>
