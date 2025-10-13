import { computed, type Ref } from 'vue';

export interface DataPoint {
  x: number;
  y: number;
  isOutlier?: boolean;
}

/**
 * IQR-based outlier detection composable
 */
export function useOutlierDetection() {
  /**
   * Detect outliers using Interquartile Range (IQR) method
   * @param values Array of values to analyze
   * @param sensitivity Multiplier for IQR (default 1.5, higher = less sensitive)
   * @returns Set of indices that are outliers
   */
  function detectOutliersIQR(values: number[], sensitivity: number = 1.5): Set<number> {
    if (values.length < 4) return new Set();

    const sorted = [...values].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];

    if (q1 === undefined || q3 === undefined) {
      return new Set();
    }

    const iqr = q3 - q1;
    const lowerBound = q1 - sensitivity * iqr;
    const upperBound = q3 + sensitivity * iqr;

    const outlierIndices = new Set<number>();
    values.forEach((val, idx) => {
      if (val < lowerBound || val > upperBound) {
        outlierIndices.add(idx);
      }
    });

    return outlierIndices;
  }

  /**
   * Apply outlier detection to data points
   * @param points Data points to analyze
   * @param sensitivity Sensitivity multiplier
   * @param enabled Whether outlier detection is enabled
   * @returns Points with isOutlier flag set
   */
  function applyOutlierDetection(
    points: DataPoint[],
    sensitivity: number,
    enabled: boolean
  ): DataPoint[] {
    const result = [...points];

    if (!enabled || points.length < 4) {
      result.forEach(point => point.isOutlier = false);
      return result;
    }

    const xValues = points.map(p => p.x);
    const yValues = points.map(p => p.y);
    const xOutliers = detectOutliersIQR(xValues, sensitivity);
    const yOutliers = detectOutliersIQR(yValues, sensitivity);

    result.forEach((point, idx) => {
      point.isOutlier = xOutliers.has(idx) || yOutliers.has(idx);
    });

    return result;
  }

  /**
   * Create computed property for outlier count
   */
  function useOutlierCount(points: Ref<DataPoint[]>) {
    return computed(() => points.value.filter(p => p.isOutlier).length);
  }

  /**
   * Create computed property for filtered points (excluding outliers)
   */
  function useFilteredPoints(points: Ref<DataPoint[]>, excludeOutliers: Ref<boolean>) {
    return computed(() =>
      excludeOutliers.value
        ? points.value.filter(p => !p.isOutlier)
        : points.value
    );
  }

  return {
    detectOutliersIQR,
    applyOutlierDetection,
    useOutlierCount,
    useFilteredPoints,
  };
}
