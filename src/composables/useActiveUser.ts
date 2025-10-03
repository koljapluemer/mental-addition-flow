import { computed, ref } from "vue";
import { db, logEvent, type UserRecord } from "@/db";

const ACTIVE_USER_KEY = "maf.activeUserId";

const activeUser = ref<UserRecord | null>(null);
const isLoaded = ref(false);

async function loadActiveUserFromStorage() {
  if (isLoaded.value) return;

  if (typeof window === "undefined") {
    isLoaded.value = true;
    return;
  }

  const storedId = Number(window.localStorage.getItem(ACTIVE_USER_KEY) || "");

  if (!Number.isNaN(storedId) && storedId > 0) {
    const user = await db.users.get(storedId);
    if (user) {
      activeUser.value = user;
      await db.users.update(user.id!, { lastActiveAt: Date.now() });
    } else {
      window.localStorage.removeItem(ACTIVE_USER_KEY);
    }
  }

  isLoaded.value = true;
}

async function setActiveUser(userId: number) {
  const user = await db.users.get(userId);
  if (!user) return;

  activeUser.value = user;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIVE_USER_KEY, String(userId));
  }
  const timestamp = Date.now();
  await db.users.update(userId, { lastActiveAt: timestamp });
  await logEvent({
    userId,
    type: "user_selected",
    payload: { name: user.name },
    timestamp,
  });
}

async function createUser(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const existing = await db.users.where("name").equals(trimmed).first();
  if (existing) {
    await setActiveUser(existing.id!);
    return existing;
  }

  const timestamp = Date.now();
  const id = await db.users.add({
    name: trimmed,
    createdAt: timestamp,
    lastActiveAt: timestamp,
  });

  await logEvent({
    userId: id,
    type: "user_created",
    payload: { name: trimmed },
    timestamp,
  });

  await setActiveUser(id);
  return db.users.get(id);
}

function useActiveUser() {
  const name = computed(() => activeUser.value?.name ?? "");
  const userId = computed(() => activeUser.value?.id ?? null);

  return {
    activeUser,
    activeUserName: name,
    activeUserId: userId,
    isLoaded,
    loadActiveUserFromStorage,
    setActiveUser,
    createUser,
  };
}

export { useActiveUser };
