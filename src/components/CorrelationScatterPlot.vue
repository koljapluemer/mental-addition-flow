<script setup lang="ts">
import { computed } from 'vue';
import { Scatter } from 'vue-chartjs';
import type { DataPoint } from '@/composables/useOutlierDetection';

interface Props {
  points: DataPoint[];
  title: string;
  xAxisLabel: string;
  yAxisLabel: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  yStepSize?: number;
  showOutliers?: boolean;
  height?: string;
  normalColor?: string;
  outlierColor?: string;
  tooltipFormatter?: (x: number, y: number) => string;
}

const props = withDefaults(defineProps<Props>(), {
  showOutliers: true,
  height: '300px',
  normalColor: 'rgba(59, 130, 246, 0.5)',
  outlierColor: 'rgba(239, 68, 68, 0.5)',
  tooltipFormatter: (x: number, y: number) => `X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}`,
});

const chartData = computed(() => {
  const normalPoints = props.points.filter(p => !p.isOutlier);
  const outlierPoints = props.points.filter(p => p.isOutlier);

  const datasets = [
    {
      label: 'Normal Data Points',
      data: normalPoints,
      backgroundColor: props.normalColor,
      borderColor: props.normalColor.replace('0.5', '0.8'),
      pointRadius: 5,
      pointHoverRadius: 7,
    },
  ];

  if (outlierPoints.length > 0 && props.showOutliers) {
    datasets.push({
      label: 'Potential Outliers',
      data: outlierPoints,
      backgroundColor: props.outlierColor,
      borderColor: props.outlierColor.replace('0.5', '0.8'),
      pointRadius: 5,
      pointHoverRadius: 7,
    });
  }

  return { datasets };
});

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: props.showOutliers && props.points.some(p => p.isOutlier),
      position: 'top' as const,
    },
    title: {
      display: true,
      text: props.title,
      font: { size: 16 },
    },
    tooltip: {
      callbacks: {
        label: (context: any) => props.tooltipFormatter(context.parsed.x, context.parsed.y),
      },
    },
  },
  scales: {
    x: {
      title: {
        display: true,
        text: props.xAxisLabel,
        font: { size: 13 },
      },
      min: props.xMin,
      max: props.xMax,
    },
    y: {
      title: {
        display: true,
        text: props.yAxisLabel,
        font: { size: 13 },
      },
      min: props.yMin,
      max: props.yMax,
      ticks: props.yStepSize ? { stepSize: props.yStepSize } : undefined,
    },
  },
}));
</script>

<template>
  <div :style="{ height }">
    <Scatter :data="chartData" :options="chartOptions" />
  </div>
</template>
