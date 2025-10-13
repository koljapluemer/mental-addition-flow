import type { ExerciseRecord, EvaluationRecord, ExerciseMode } from '@/db';
import { useDifficultyCalculation, type DifficultyWeights } from './useDifficultyCalculation';
import { useOutlierDetection, type DataPoint } from './useOutlierDetection';
import { useCorrelationStats } from './useCorrelationStats';

export interface OptimizationResult {
  weights: DifficultyWeights;
  correlations: {
    cl: number | null;
    time: number | null;
    correctness: number | null;
  };
  compositeScore: number;
}

export interface OptimizationProgress {
  current: number;
  total: number;
  percentage: number;
}

/**
 * Weight optimization composable for difficulty predictor
 */
export function useWeightOptimization() {
  const { calculateDifficultyScore, normalizeDifficulty, calculateDifficultyRange } = useDifficultyCalculation();
  const { applyOutlierDetection } = useOutlierDetection();
  const { calculateCorrelation } = useCorrelationStats();

  /**
   * Calculate composite score from correlations (equal weighting)
   */
  function calculateCompositeScore(correlations: {
    cl: number | null;
    time: number | null;
    correctness: number | null;
  }): number {
    let sum = 0;
    let count = 0;

    if (correlations.cl !== null) {
      sum += correlations.cl;
      count++;
    }
    if (correlations.time !== null) {
      sum += correlations.time;
      count++;
    }
    if (correlations.correctness !== null) {
      // Use absolute value since negative correlation is still predictive
      sum += Math.abs(correlations.correctness);
      count++;
    }

    return count > 0 ? sum / count : 0;
  }

  /**
   * Calculate all correlations for a given set of weights
   */
  function calculateCorrelationsForWeights(
    weights: DifficultyWeights,
    exercises: ExerciseRecord[],
    evaluations: EvaluationRecord[],
    modeFilter: ExerciseMode | 'all',
    detectOutliers: boolean,
    outlierSensitivity: number
  ): { cl: number | null; time: number | null; correctness: number | null } {
    const range = calculateDifficultyRange(exercises, weights, modeFilter);

    // Calculate difficulty vs time points
    const timePoints: DataPoint[] = [];
    exercises.forEach(ex => {
      if (!ex.solvedAt || !ex.id) return;
      if (modeFilter !== 'all' && ex.mode !== modeFilter) return;

      const duration = (ex.solvedAt - ex.displayedAt) / 1000;
      if (duration < 0.5 || duration > 120) return;

      const rawDifficulty = calculateDifficultyScore(ex, weights);
      const difficulty = normalizeDifficulty(rawDifficulty, range);

      timePoints.push({ x: difficulty, y: duration, isOutlier: false });
    });

    const timePointsWithOutliers = applyOutlierDetection(timePoints, outlierSensitivity, detectOutliers);
    const timeCorr = calculateCorrelation(timePointsWithOutliers.filter(p => !p.isOutlier));

    // Calculate difficulty vs CL rating points
    const ratingMap = new Map<number, number[]>();
    evaluations.forEach(evaluation => {
      if (modeFilter !== 'all' && evaluation.mode !== modeFilter) return;
      if (evaluation.rating < 1 || evaluation.rating > 9) return;

      evaluation.exerciseIds.forEach(exerciseId => {
        if (!ratingMap.has(exerciseId)) {
          ratingMap.set(exerciseId, []);
        }
        ratingMap.get(exerciseId)!.push(evaluation.rating);
      });
    });

    const ratingPoints: DataPoint[] = [];
    exercises.forEach(ex => {
      if (!ex.id) return;
      const ratings = ratingMap.get(ex.id);
      if (!ratings || ratings.length === 0) return;

      const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
      const rawDifficulty = calculateDifficultyScore(ex, weights);
      const difficulty = normalizeDifficulty(rawDifficulty, range);

      ratingPoints.push({ x: difficulty, y: avgRating, isOutlier: false });
    });

    const ratingPointsWithOutliers = applyOutlierDetection(ratingPoints, outlierSensitivity, detectOutliers);
    const clCorr = calculateCorrelation(ratingPointsWithOutliers.filter(p => !p.isOutlier));

    // Calculate difficulty vs correctness points
    const correctnessPoints: DataPoint[] = [];
    exercises.forEach(ex => {
      if (!ex.id || ex.keystrokeCount === undefined) return;
      if (modeFilter !== 'all' && ex.mode !== modeFilter) return;

      const optimal = ex.answer.toString().length;
      const efficiency = (ex.keystrokeCount / optimal) * 100;

      if (efficiency < 100 || efficiency > 500) return;

      const rawDifficulty = calculateDifficultyScore(ex, weights);
      const difficulty = normalizeDifficulty(rawDifficulty, range);

      const isCorrect = efficiency === 100 ? 1 : 0;

      correctnessPoints.push({ x: difficulty, y: isCorrect, isOutlier: false });
    });

    const correctnessPointsWithOutliers = applyOutlierDetection(correctnessPoints, outlierSensitivity, detectOutliers);
    const correctnessCorr = calculateCorrelation(correctnessPointsWithOutliers.filter(p => !p.isOutlier));

    return {
      cl: clCorr,
      time: timeCorr,
      correctness: correctnessCorr,
    };
  }

  /**
   * Grid search to find optimal weights
   */
  async function gridSearch(
    exercises: ExerciseRecord[],
    evaluations: EvaluationRecord[],
    modeFilter: ExerciseMode | 'all',
    detectOutliers: boolean,
    outlierSensitivity: number,
    onProgress?: (progress: OptimizationProgress) => void
  ): Promise<OptimizationResult> {
    // Grid parameters
    const digitsRange = { min: 0, max: 5, step: 0.2 };
    const carryoversRange = { min: 0, max: 10, step: 0.4 };
    const zerosRange = { min: 0, max: 5, step: 0.2 };

    const digitsValues = [];
    for (let d = digitsRange.min; d <= digitsRange.max; d += digitsRange.step) {
      digitsValues.push(Math.round(d * 10) / 10);
    }

    const carryoversValues = [];
    for (let c = carryoversRange.min; c <= carryoversRange.max; c += carryoversRange.step) {
      carryoversValues.push(Math.round(c * 10) / 10);
    }

    const zerosValues = [];
    for (let z = zerosRange.min; z <= zerosRange.max; z += zerosRange.step) {
      zerosValues.push(Math.round(z * 10) / 10);
    }

    const totalCombinations = digitsValues.length * carryoversValues.length * zerosValues.length;
    let currentCombination = 0;

    let bestResult: OptimizationResult = {
      weights: { digits: 1.0, carryovers: 2.5, zeros: 0.5 },
      correlations: { cl: null, time: null, correctness: null },
      compositeScore: -Infinity,
    };

    // Search through all combinations
    for (const digits of digitsValues) {
      for (const carryovers of carryoversValues) {
        for (const zeros of zerosValues) {
          const weights: DifficultyWeights = { digits, carryovers, zeros };

          const correlations = calculateCorrelationsForWeights(
            weights,
            exercises,
            evaluations,
            modeFilter,
            detectOutliers,
            outlierSensitivity
          );

          const compositeScore = calculateCompositeScore(correlations);

          if (compositeScore > bestResult.compositeScore) {
            bestResult = {
              weights,
              correlations,
              compositeScore,
            };
          }

          currentCombination++;

          // Report progress every 100 combinations
          if (onProgress && currentCombination % 100 === 0) {
            onProgress({
              current: currentCombination,
              total: totalCombinations,
              percentage: (currentCombination / totalCombinations) * 100,
            });
            // Allow UI to update
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
      }
    }

    // Final progress update
    if (onProgress) {
      onProgress({
        current: totalCombinations,
        total: totalCombinations,
        percentage: 100,
      });
    }

    return bestResult;
  }

  return {
    calculateCompositeScore,
    calculateCorrelationsForWeights,
    gridSearch,
  };
}
