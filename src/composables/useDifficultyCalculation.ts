import { computed, type Ref } from 'vue';
import type { ExerciseRecord, ExerciseMode } from '@/db';
import type { DifficultyWeights } from '@/types/difficulty';

export interface DifficultyRange {
  min: number;
  max: number;
}

/**
 * Difficulty calculation and normalization composable
 */
export function useDifficultyCalculation() {
  /**
   * Count total digits in both operands
   */
  function countTotalDigits(operandA: number, operandB: number): number {
    return String(operandA).length + String(operandB).length;
  }

  /**
   * Count zeros in both operands (negative contribution to difficulty)
   */
  function countZeros(operandA: number, operandB: number): number {
    const strA = String(operandA);
    const strB = String(operandB);
    const zeroCount = (strA.match(/0/g) || []).length + (strB.match(/0/g) || []).length;
    return -zeroCount;
  }

  /**
   * Count carry operations required for addition
   */
  function countCarryovers(operandA: number, operandB: number): number {
    const strA = String(operandA).split('').reverse();
    const strB = String(operandB).split('').reverse();
    const maxLen = Math.max(strA.length, strB.length);

    let carryovers = 0;
    let carry = 0;

    for (let i = 0; i < maxLen; i++) {
      const digitA = parseInt(strA[i] || '0');
      const digitB = parseInt(strB[i] || '0');
      const sum = digitA + digitB + carry;

      if (sum >= 10) {
        carryovers++;
        carry = 1;
      } else {
        carry = 0;
      }
    }

    return carryovers;
  }

  /**
   * Calculate raw difficulty score for an exercise
   */
  function calculateDifficultyScore(
    ex: ExerciseRecord,
    weights: DifficultyWeights
  ): number {
    return (
      weights.digits * countTotalDigits(ex.operandA, ex.operandB) +
      weights.carryovers * countCarryovers(ex.operandA, ex.operandB) +
      weights.zeros * countZeros(ex.operandA, ex.operandB)
    );
  }

  /**
   * Calculate min/max difficulty range for normalization
   */
  function calculateDifficultyRange(
    exercises: ExerciseRecord[],
    weights: DifficultyWeights,
    modeFilter: ExerciseMode | 'all'
  ): DifficultyRange {
    const scores: number[] = [];

    exercises.forEach(ex => {
      if (modeFilter !== 'all' && ex.mode !== modeFilter) return;

      const score = calculateDifficultyScore(ex, weights);
      scores.push(score);
    });

    if (scores.length === 0) return { min: 0, max: 100 };

    const min = Math.min(...scores);
    const max = Math.max(...scores);

    // Avoid division by zero if all scores are the same
    if (min === max) return { min: min - 1, max: min + 1 };

    return { min, max };
  }

  /**
   * Normalize a raw difficulty score to 0-100 scale
   */
  function normalizeDifficulty(rawScore: number, range: DifficultyRange): number {
    return ((rawScore - range.min) / (range.max - range.min)) * 100;
  }

  /**
   * Create computed property for difficulty range
   */
  function useDifficultyRange(
    exercises: Ref<ExerciseRecord[]>,
    weights: Ref<DifficultyWeights>,
    modeFilter: Ref<ExerciseMode | 'all'>
  ) {
    return computed(() => calculateDifficultyRange(exercises.value, weights.value, modeFilter.value));
  }

  return {
    countTotalDigits,
    countZeros,
    countCarryovers,
    calculateDifficultyScore,
    calculateDifficultyRange,
    normalizeDifficulty,
    useDifficultyRange,
  };
}
