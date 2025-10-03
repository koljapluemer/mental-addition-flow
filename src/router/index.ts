import { createRouter, createWebHistory } from "vue-router";
import MainView from "@/views/MainView.vue";
import { useActiveUser } from "@/composables/useActiveUser";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "main",
      component: MainView,
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("@/views/SettingsView.vue"),
    },
    {
      path: "/logs",
      name: "logs",
      component: () => import("@/views/LogsView.vue"),
    },
  ],
});

let hasLoadedActiveUser = false;

router.beforeEach(async (to) => {
  const { loadActiveUserFromStorage, activeUserId, isLoaded } = useActiveUser();

  if (!hasLoadedActiveUser) {
    await loadActiveUserFromStorage();
    hasLoadedActiveUser = true;
  } else if (!isLoaded.value) {
    await loadActiveUserFromStorage();
  }

  if (to.name !== "settings" && !activeUserId.value) {
    return {
      name: "settings",
      query: to.fullPath ? { redirect: to.fullPath } : undefined,
    };
  }

  return true;
});

export default router;
