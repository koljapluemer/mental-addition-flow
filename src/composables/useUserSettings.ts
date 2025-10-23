import { ref } from "vue";
import { db, type ExerciseMode } from "@/db";

const graduallyIncreaseDifficulty = ref(false);
const progressiveDifficultyActivatedAt = ref<number | undefined>(undefined);
const exerciseMode = ref<ExerciseMode>("self-paced");

export function useUserSettings() {
  async function loadUserSettings(userId: number) {
    const settings = await db.userSettings.get({ userId });
    if (settings) {
      graduallyIncreaseDifficulty.value = settings.graduallyIncreaseDifficulty;
      progressiveDifficultyActivatedAt.value = settings.progressiveDifficultyActivatedAt;
      exerciseMode.value = settings.exerciseMode ?? "self-paced";
    } else {
      // Default values
      graduallyIncreaseDifficulty.value = false;
      progressiveDifficultyActivatedAt.value = undefined;
      exerciseMode.value = "self-paced";
    }
  }

  async function updateGraduallyIncreaseDifficulty(
    userId: number,
    value: boolean,
  ) {
    const existing = await db.userSettings.get({ userId });
    const now = Date.now();

    // If enabling progressive difficulty, set activation timestamp
    const activatedAt = value ? now : undefined;

    if (existing) {
      await db.userSettings.update(existing.id!, {
        graduallyIncreaseDifficulty: value,
        progressiveDifficultyActivatedAt: activatedAt,
        updatedAt: now,
      });
    } else {
      await db.userSettings.add({
        userId,
        graduallyIncreaseDifficulty: value,
        progressiveDifficultyActivatedAt: activatedAt,
        updatedAt: now,
      });
    }
    graduallyIncreaseDifficulty.value = value;
    progressiveDifficultyActivatedAt.value = activatedAt;
  }

  async function updateExerciseMode(userId: number, mode: ExerciseMode) {
    const existing = await db.userSettings.get({ userId });
    const now = Date.now();

    if (existing) {
      await db.userSettings.update(existing.id!, {
        exerciseMode: mode,
        updatedAt: now,
      });
    } else {
      await db.userSettings.add({
        userId,
        graduallyIncreaseDifficulty: false,
        exerciseMode: mode,
        updatedAt: now,
      });
    }
    exerciseMode.value = mode;
  }

  return {
    graduallyIncreaseDifficulty,
    progressiveDifficultyActivatedAt,
    exerciseMode,
    loadUserSettings,
    updateGraduallyIncreaseDifficulty,
    updateExerciseMode,
  };
}
