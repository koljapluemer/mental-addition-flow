<script setup lang="ts">
import { RouterView } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
</script>

<template>
  <div class="flex min-h-screen flex-col bg-base-200 text-base-content">
    <AppHeader />
    <main class="flex flex-1 justify-center px-4">
      <RouterView />
    </main>
  </div>
</template>
