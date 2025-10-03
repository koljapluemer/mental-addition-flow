<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { Home, Settings as SettingsIcon, ListTree } from "lucide-vue-next";
import { useActiveUser } from "@/composables/useActiveUser";

const route = useRoute();
const { activeUserName } = useActiveUser();

const navItems = [
  { name: "Main", to: "/", icon: Home },
  { name: "Settings", to: "/settings", icon: SettingsIcon },
  { name: "Logs", to: "/logs", icon: ListTree },
];

const currentPath = computed(() => route.path);
</script>

<template>
  <header
    class="sticky top-0 z-20 border-b border-base-200 bg-base-100/80 backdrop-blur"
  >
    <div class="navbar mx-auto max-w-5xl">
      <div class="navbar-start">
        <RouterLink class="btn btn-ghost text-xl font-black" to="/"
          >Mental Addition Flow</RouterLink
        >
      </div>
      <div class="navbar-center gap-2">
        <nav class="flex items-center gap-1">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="btn btn-ghost btn-sm"
            :class="{ 'btn-active text-primary': currentPath === item.to }"
            :aria-current="currentPath === item.to ? 'page' : undefined"
          >
            <component :is="item.icon" class="h-4 w-4 sm:mr-2" />
            <span class="hidden sm:inline">{{ item.name }}</span>
          </RouterLink>
        </nav>
      </div>
      <div class="navbar-end">
        <div v-if="activeUserName" class="badge badge-outline badge-lg gap-2">
          <span
            class="hidden text-xs font-semibold uppercase tracking-wide sm:inline"
            >Active</span
          >
          <span class="text-sm font-semibold">{{ activeUserName }}</span>
        </div>
        <RouterLink v-else class="btn btn-primary btn-sm" to="/settings"
          >Set User</RouterLink
        >
      </div>
    </div>
  </header>
</template>
