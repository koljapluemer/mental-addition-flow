<script setup lang="ts">
import { computed } from 'vue';
import { Chart as ChartJS, CategoryScale, LinearScale } from 'chart.js';
import { BoxPlotController, BoxAndWiskers } from '@sgratzl/chartjs-chart-boxplot';
import { Chart } from 'vue-chartjs';
import type { DataPoint } from '@/composables/useOutlierDetection';

// Register the boxplot components
ChartJS.register(BoxPlotController, BoxAndWiskers, CategoryScale, LinearScale);

interface Props {
  points: DataPoint[];
  title: string;
  xAxisLabel: string;
  yAxisLabel: string;
  height?: string;
}

const props = withDefaults(defineProps<Props>(), {
  height: '300px',
});

const chartData = computed(() => {
  // Separate correct and incorrect
  const correctTimes = props.points
    .filter(p => p.x === 1 && !p.isOutlier)
    .map(p => p.y);
  const incorrectTimes = props.points
    .filter(p => p.x === 0 && !p.isOutlier)
    .map(p => p.y);

  return {
    labels: ['Incorrect', 'Correct'],
    datasets: [
      {
        label: 'Solve Time',
        data: [incorrectTimes, correctTimes],
        backgroundColor: [
          'rgba(239, 68, 68, 0.5)',
          'rgba(34, 197, 94, 0.5)',
        ],
        borderColor: [
          'rgba(239, 68, 68, 1)',
          'rgba(34, 197, 94, 1)',
        ],
        borderWidth: 2,
        outlierColor: 'rgba(0, 0, 0, 0.3)',
        padding: 10,
        itemRadius: 0,
      },
    ],
  };
});

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    title: {
      display: true,
      text: props.title,
      font: { size: 16 },
    },
  },
  scales: {
    x: {
      title: {
        display: true,
        text: props.xAxisLabel,
        font: { size: 13 },
      },
    },
    y: {
      title: {
        display: true,
        text: props.yAxisLabel,
        font: { size: 13 },
      },
      min: 0,
    },
  },
}));
</script>

<template>
  <div :style="{ height }">
    <Chart type="boxplot" :data="chartData" :options="chartOptions" />
  </div>
</template>
