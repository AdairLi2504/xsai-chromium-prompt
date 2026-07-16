<script setup lang="ts">
withDefaults(defineProps<{
  percentage?: number
  text: string
  total?: number
}>(), {
  percentage: 0,
})
</script>

<template>
  <div
    class="flex items-center justify-between whitespace-nowrap rounded-lg bg-violet-100 px-3 py-2 text-sm dark:bg-violet-900"
    :style="{ width: `${percentage}%` }"
  >
    <span>{{ text }}</span>
    <span>({{ percentage.toFixed(2) }}%)</span>
  </div>
</template>
