import { db, logEvent, type EvaluationScope, type ExerciseMode } from "@/db";

export interface SaveEvaluationInput {
  userId: number;
  scope: EvaluationScope;
  rating: number;
  exerciseIds: number[];
  mode: ExerciseMode;
}

export async function saveEvaluation({
  userId,
  scope,
  rating,
  exerciseIds,
  mode,
}: SaveEvaluationInput) {
  const createdAt = Date.now();
  const evaluationId = await db.evaluations.add({
    userId,
    scope,
    rating,
    exerciseIds,
    mode,
    createdAt,
  });

  await logEvent({
    userId,
    type: "evaluation_submitted",
    payload: {
      evaluationId,
      scope,
      rating,
      exerciseIds,
      mode,
    },
    timestamp: createdAt,
  });

  return db.evaluations.get(evaluationId);
}

export async function logEvaluationPrompt(
  userId: number,
  exerciseId: number,
  scope: EvaluationScope,
  mode: ExerciseMode,
) {
  await logEvent({
    userId,
    type: "evaluation_prompted",
    exerciseId,
    payload: { scope, mode },
  });
}
