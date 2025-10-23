import { db, logEvent, type ExerciseMode } from "@/db";

export interface CreateExerciseInput {
  userId: number;
  operandA: number;
  operandB: number;
  mode: ExerciseMode;
}

export async function createExerciseRecord({
  userId,
  operandA,
  operandB,
  mode,
}: CreateExerciseInput) {
  const displayedAt = Date.now();
  const answer = operandA + operandB;
  const exerciseId = await db.exercises.add({
    userId,
    operandA,
    operandB,
    answer,
    displayedAt,
    mode,
  });

  await logEvent({
    userId,
    type: "exercise_shown",
    exerciseId,
    payload: {
      operandA,
      operandB,
      mode,
    },
    timestamp: displayedAt,
  });

  return db.exercises.get(exerciseId);
}

export async function markExerciseSolved(
  exerciseId: number,
  {
    userId,
    inputValue,
    mode,
    keystrokeCount,
    timedOut,
  }: {
    userId: number;
    inputValue: string;
    mode: ExerciseMode;
    keystrokeCount?: number;
    timedOut?: boolean;
  },
) {
  const solvedAt = Date.now();
  await db.exercises.update(exerciseId, {
    solvedAt,
    keystrokeCount,
    timedOut,
  });
  await logEvent({
    userId,
    type: "exercise_solved",
    exerciseId,
    payload: {
      mode,
      inputValue,
      keystrokeCount,
      timedOut,
    },
    timestamp: solvedAt,
  });
}

export async function markExerciseTimedOut(
  exerciseId: number,
  userId: number,
) {
  const timedOutAt = Date.now();
  await db.exercises.update(exerciseId, {
    timedOut: true,
  });
  await logEvent({
    userId,
    type: "exercise_timed_out",
    exerciseId,
    payload: {
      timedOutAt,
    },
    timestamp: timedOutAt,
  });
}

export async function updateExerciseMode(
  exerciseId: number,
  mode: ExerciseMode,
  userId: number,
) {
  const updatedAt = Date.now();
  await db.exercises.update(exerciseId, { mode });
  await logEvent({
    userId,
    type: "exercise_mode_changed",
    exerciseId,
    payload: { mode },
    timestamp: updatedAt,
  });
}

export async function attachEvaluation(
  exerciseIds: number[],
  evaluationId: number,
  userId: number,
) {
  const updatedAt = Date.now();
  await Promise.all(
    exerciseIds.map((exerciseId) =>
      db.exercises.update(exerciseId, {
        evaluationId,
      }),
    ),
  );
  await logEvent({
    userId,
    type: "evaluation_attached",
    payload: { evaluationId, exerciseIds },
    timestamp: updatedAt,
  });
}
