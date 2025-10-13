import type { DataPoint } from './useOutlierDetection';

/**
 * Correlation statistics composable
 */
export function useCorrelationStats() {
  /**
   * Calculate Pearson correlation coefficient
   * Also works as point-biserial correlation for binary outcomes
   */
  function calculateCorrelation(points: DataPoint[]): number | null {
    if (points.length < 2) return null;

    const n = points.length;
    const sumX = points.reduce((sum, p) => sum + p.x, 0);
    const sumY = points.reduce((sum, p) => sum + p.y, 0);
    const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumX2 = points.reduce((sum, p) => sum + p.x * p.x, 0);
    const sumY2 = points.reduce((sum, p) => sum + p.y * p.y, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    if (denominator === 0) return null;
    return numerator / denominator;
  }

  /**
   * Calculate R² (coefficient of determination)
   */
  function calculateRSquared(points: DataPoint[]): number | null {
    if (points.length < 2) return null;

    const n = points.length;
    const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;

    // Total sum of squares
    const ssTot = points.reduce((sum, p) => sum + Math.pow(p.y - meanY, 2), 0);

    if (ssTot === 0) return null;

    // Calculate predicted values using linear regression
    const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
    const sumXY = points.reduce((sum, p) => sum + (p.x - meanX) * (p.y - meanY), 0);
    const sumX2 = points.reduce((sum, p) => sum + Math.pow(p.x - meanX, 2), 0);

    if (sumX2 === 0) return null;

    const slope = sumXY / sumX2;
    const intercept = meanY - slope * meanX;

    // Residual sum of squares
    const ssRes = points.reduce((sum, p) => {
      const predicted = slope * p.x + intercept;
      return sum + Math.pow(p.y - predicted, 2);
    }, 0);

    return 1 - (ssRes / ssTot);
  }

  /**
   * Get correlation strength label
   */
  function getCorrelationStrength(correlation: number | null): string {
    if (correlation === null) return 'Unknown';
    const abs = Math.abs(correlation);
    if (abs < 0.3) return 'Weak';
    if (abs < 0.7) return 'Moderate';
    return 'Strong';
  }

  return {
    calculateCorrelation,
    calculateRSquared,
    getCorrelationStrength,
  };
}
