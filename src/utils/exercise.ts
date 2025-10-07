export interface ExerciseOperands {
  operandA: number;
  operandB: number;
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDigits(minDigits: number, maxDigits: number) {
  const digits = randomInt(minDigits, maxDigits);
  const lower = 10 ** (digits - 1);
  const upper = 10 ** digits - 1;
  if (digits === 1) {
    return randomInt(1, 9);
  }
  return randomInt(lower, upper);
}

export interface ProgressiveDifficultyParams {
  solvedCount: number;
  maxDigits?: number;
}

export function getProgressiveDifficulty(
  params: ProgressiveDifficultyParams,
): { digitsA: number; digitsB: number } {
  const { solvedCount, maxDigits = 4 } = params;

  // Calculate progression level (increases every 3 exercises)
  const level = Math.floor(solvedCount / 3);

  // Start with 1 digit for both operands
  let digitsA = 1;
  let digitsB = 1;

  // Add digits alternately, capping at maxDigits
  for (let i = 0; i < level; i++) {
    if (i % 2 === 0) {
      // Even levels: increase first operand
      if (digitsA < maxDigits) {
        digitsA++;
      } else if (digitsB < maxDigits) {
        digitsB++;
      }
    } else {
      // Odd levels: increase second operand
      if (digitsB < maxDigits) {
        digitsB++;
      } else if (digitsA < maxDigits) {
        digitsA++;
      }
    }
  }

  return { digitsA, digitsB };
}

export function generateExerciseOperands(
  progressive?: ProgressiveDifficultyParams,
): ExerciseOperands {
  if (progressive) {
    const { digitsA, digitsB } = getProgressiveDifficulty(progressive);
    return {
      operandA: randomDigits(digitsA, digitsA),
      operandB: randomDigits(digitsB, digitsB),
    };
  }

  return {
    operandA: randomDigits(1, 4),
    operandB: randomDigits(1, 4),
  };
}
