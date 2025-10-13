export interface DifficultyWeights {
  digits: number;
  carryovers: number;
  zeros: number;
}

export const DEFAULT_DIFFICULTY_WEIGHTS: DifficultyWeights = {
  digits: 1.0,
  carryovers: 2.5,
  zeros: 0.5,
};

export function mergeDifficultyWeights(
  overrides?: Partial<DifficultyWeights> | null,
): DifficultyWeights {
  return {
    digits: overrides?.digits ?? DEFAULT_DIFFICULTY_WEIGHTS.digits,
    carryovers: overrides?.carryovers ?? DEFAULT_DIFFICULTY_WEIGHTS.carryovers,
    zeros: overrides?.zeros ?? DEFAULT_DIFFICULTY_WEIGHTS.zeros,
  };
}
