<script setup lang="ts">
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export interface BucketData {
  bucket: string;
  successRate: number;
  totalCount: number;
  correctCount: number;
}

interface Props {
  buckets: BucketData[];
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  height?: string;
  barColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Success Rate by Difficulty',
  xAxisLabel: 'Difficulty Range',
  yAxisLabel: 'Success Rate (%)',
  height: '300px',
  barColor: 'rgba(34, 197, 94, 0.7)',
});

const chartData = computed(() => ({
  labels: props.buckets.map(b => b.bucket),
  datasets: [
    {
      label: 'Success Rate',
      data: props.buckets.map(b => b.successRate),
      backgroundColor: props.barColor,
      borderColor: props.barColor.replace('0.7', '0.9'),
      borderWidth: 1,
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
      text: props.title,
      font: { size: 16 },
    },
    tooltip: {
      callbacks: {
        label: (context: any) => {
          const bucket = props.buckets[context.dataIndex];
          if (!bucket) return '';
          return [
            `Success Rate: ${bucket.successRate.toFixed(1)}%`,
            `Correct: ${bucket.correctCount}/${bucket.totalCount}`,
          ];
        },
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
    },
    y: {
      title: {
        display: true,
        text: props.yAxisLabel,
        font: { size: 13 },
      },
      min: 0,
      max: 100,
      ticks: {
        callback: (value: any) => `${value}%`,
      },
    },
  },
}));
</script>

<template>
  <div :style="{ height }">
    <Bar :data="chartData" :options="chartOptions" />
  </div>
</template>
