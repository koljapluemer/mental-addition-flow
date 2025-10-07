<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { liveQuery } from "dexie";
import { useRouter, useRoute } from "vue-router";
import { db, type UserRecord } from "@/db";
import { useActiveUser } from "@/composables/useActiveUser";
import { useUserSettings } from "@/composables/useUserSettings";

const router = useRouter();
const route = useRoute();
const users = ref<UserRecord[]>([]);
const newUserName = ref("");
const isSubmitting = ref(false);
const errorMessage = ref("");

const { setActiveUser, createUser, activeUserId } = useActiveUser();
const {
  graduallyIncreaseDifficulty,
  loadUserSettings,
  updateGraduallyIncreaseDifficulty,
} = useUserSettings();

let subscription: { unsubscribe: () => void } | null = null;

onMounted(() => {
  subscription = liveQuery(() =>
    db.users.orderBy("lastActiveAt").reverse().toArray(),
  ).subscribe({
    next(data) {
      users.value = data;
    },
  });
});

onUnmounted(() => {
  subscription?.unsubscribe();
});

function resetError() {
  errorMessage.value = "";
}

async function goToDestination() {
  const redirect =
    typeof route.query.redirect === "string" ? route.query.redirect : "/";
  await router.push(redirect);
}

async function handleSelectUser(userId: number) {
  await setActiveUser(userId);
  await goToDestination();
}

async function handleCreateUser() {
  if (isSubmitting.value) return;
  resetError();
  const trimmed = newUserName.value.trim();
  if (!trimmed) {
    errorMessage.value = "Please enter a name.";
    return;
  }
  isSubmitting.value = true;
  try {
    await createUser(trimmed);
    newUserName.value = "";
    await goToDestination();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "Unable to create user.";
  } finally {
    isSubmitting.value = false;
  }
}

async function handleToggleDifficulty(event: Event) {
  if (!activeUserId.value) return;
  const target = event.target as HTMLInputElement;
  await updateGraduallyIncreaseDifficulty(activeUserId.value, target.checked);
}

watch(activeUserId, async (userId) => {
  if (userId) {
    await loadUserSettings(userId);
  }
}, { immediate: true });

async function downloadAllData() {
  if (!activeUserId.value) return;

  const data = {
    exportedAt: new Date().toISOString(),
    user: await db.users.get(activeUserId.value),
    settings: await db.userSettings.get({ userId: activeUserId.value }),
    exercises: await db.exercises.where({ userId: activeUserId.value }).toArray(),
    events: await db.events.where({ userId: activeUserId.value }).toArray(),
    evaluations: await db.evaluations.where({ userId: activeUserId.value }).toArray(),
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mental-addition-data-${data.user?.name}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="mx-auto flex w-full max-w-3xl flex-col gap-8 py-12">
    <header class="space-y-2 text-center">
      <h1 class="text-3xl font-bold">Choose or create a user</h1>
      <p class="text-base-content/70">
        All tracking data links to the active user. Select an existing entry or
        add a new one to continue.
      </p>
    </header>

    <div
      v-if="activeUserId"
      class="card border border-base-300 bg-base-100 shadow"
    >
      <div class="card-body">
        <h2 class="card-title text-lg">Settings</h2>
        <div class="form-control">
          <label class="label cursor-pointer justify-start gap-4">
            <input
              type="checkbox"
              class="toggle toggle-primary"
              :checked="graduallyIncreaseDifficulty"
              @change="handleToggleDifficulty"
            />
            <div class="space-y-1">
              <span class="label-text font-semibold"
                >Gradually increase difficulty</span
              >
              <p class="text-sm text-base-content/60">
                Start with single digit addition and progressively increase
                complexity every 3 exercises
              </p>
            </div>
          </label>
        </div>
      </div>
    </div>

    <div
      v-if="activeUserId"
      class="card border border-base-300 bg-base-100 shadow"
    >
      <div class="card-body">
        <h2 class="card-title text-lg">Data Export</h2>
        <p class="text-sm text-base-content/60">
          Download all your data including exercises, events, and evaluations as JSON
        </p>
        <div class="card-actions justify-end">
          <button
            type="button"
            class="btn btn-primary"
            @click="downloadAllData"
          >
            Download Data
          </button>
        </div>
      </div>
    </div>

    <div v-if="users.length" class="grid gap-4 md:grid-cols-2">
      <article
        v-for="user in users"
        :key="user.id"
        class="card border border-base-300 bg-base-100 shadow"
      >
        <div class="card-body">
          <h2 class="card-title">
            <span>{{ user.name }}</span>
            <span v-if="activeUserId === user.id" class="badge badge-primary"
              >Active</span
            >
          </h2>
          <p class="text-sm text-base-content/60">
            Last active: {{ new Date(user.lastActiveAt).toLocaleString() }}
          </p>
          <div class="card-actions justify-end">
            <button
              type="button"
              class="btn btn-primary"
              @click="handleSelectUser(user.id!)"
            >
              Use
            </button>
          </div>
        </div>
      </article>
    </div>
    <div
      v-else
      class="rounded-2xl border border-dashed border-base-300 p-8 text-center text-base-content/60"
    >
      No users yet. Create your first participant below.
    </div>

    <form
      class="card border border-base-300 bg-base-100 shadow"
      @submit.prevent="handleCreateUser"
    >
      <div class="card-body space-y-4">
        <div class="space-y-2">
          <label class="label">
            <span class="label-text text-lg font-semibold">Add a new user</span>
          </label>
          <input
            v-model="newUserName"
            type="text"
            class="input input-bordered input-lg"
            placeholder="Participant name"
            @input="resetError"
          />
        </div>
        <p v-if="errorMessage" class="text-sm text-error">{{ errorMessage }}</p>
        <div class="card-actions justify-end">
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="isSubmitting"
          >
            <span v-if="isSubmitting" class="loading loading-spinner"></span>
            <span v-else>Create user</span>
          </button>
        </div>
      </div>
    </form>
  </section>
</template>
