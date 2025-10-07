import { ref } from "vue";
import { db, type UserSettingsRecord } from "@/db";

const graduallyIncreaseDifficulty = ref(false);
const progressiveDifficultyActivatedAt = ref<number | undefined>(undefined);

export function useUserSettings() {
  async function loadUserSettings(userId: number) {
    const settings = await db.userSettings.get({ userId });
    if (settings) {
      graduallyIncreaseDifficulty.value = settings.graduallyIncreaseDifficulty;
      progressiveDifficultyActivatedAt.value = settings.progressiveDifficultyActivatedAt;
    } else {
      // Default values
      graduallyIncreaseDifficulty.value = false;
      progressiveDifficultyActivatedAt.value = undefined;
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

  return {
    graduallyIncreaseDifficulty,
    progressiveDifficultyActivatedAt,
    loadUserSettings,
    updateGraduallyIncreaseDifficulty,
  };
}
