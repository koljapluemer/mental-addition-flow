import Dexie, { type Table } from "dexie";

export type ExerciseMode = "trial" | "serious";

export interface UserRecord {
  id?: number;
  name: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface ExerciseRecord {
  id?: number;
  userId: number;
  operandA: number;
  operandB: number;
  answer: number;
  displayedAt: number;
  solvedAt?: number;
  mode: ExerciseMode;
  evaluationId?: number;
  keystrokeCount?: number;
}

export interface EventRecord {
  id?: number;
  userId: number;
  exerciseId?: number;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export type EvaluationScope =
  | "this task"
  | "the last exercise"
  | "the last three exercises"
  | "the last five exercises"
  | "the last 10 exercises";

export interface EvaluationRecord {
  id?: number;
  userId: number;
  scope: EvaluationScope;
  rating: number;
  exerciseIds: number[];
  mode: ExerciseMode;
  createdAt: number;
}

export interface UserSettingsRecord {
  id?: number;
  userId: number;
  graduallyIncreaseDifficulty: boolean;
  progressiveDifficultyActivatedAt?: number;
  updatedAt: number;
  difficultyWeights?: {
    digits: number;
    carryovers: number;
    zeros: number;
  };
}

class AppDatabase extends Dexie {
  users!: Table<UserRecord, number>;
  exercises!: Table<ExerciseRecord, number>;
  events!: Table<EventRecord, number>;
  evaluations!: Table<EvaluationRecord, number>;
  userSettings!: Table<UserSettingsRecord, number>;

  constructor() {
    super("mentalAdditionFlow");
    this.version(2).stores({
      users: "++id,&name,lastActiveAt",
      exercises: "++id,userId,mode,displayedAt,solvedAt,[userId+displayedAt]",
      events: "++id,userId,exerciseId,type,timestamp",
      evaluations: "++id,userId,createdAt,scope,mode",
    });
    this.version(3).stores({
      users: "++id,&name,lastActiveAt",
      exercises: "++id,userId,mode,displayedAt,solvedAt,[userId+displayedAt]",
      events: "++id,userId,exerciseId,type,timestamp",
      evaluations: "++id,userId,createdAt,scope,mode",
      userSettings: "++id,&userId,updatedAt",
    });
  }
}

export const db = new AppDatabase();

export interface LogEventInput {
  userId: number;
  type: string;
  exerciseId?: number;
  payload?: Record<string, unknown>;
  timestamp?: number;
}

export async function logEvent({
  userId,
  type,
  exerciseId,
  payload = {},
  timestamp = Date.now(),
}: LogEventInput) {
  await db.events.add({
    userId,
    type,
    exerciseId,
    payload,
    timestamp,
  });
}
