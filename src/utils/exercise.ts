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

export function generateExerciseOperands(): ExerciseOperands {
  return {
    operandA: randomDigits(1, 4),
    operandB: randomDigits(1, 4),
  };
}
