<script setup lang="ts">
const route = useRoute()
const category = computed(() => String(route.params.category))
</script>

<template>
  <StoreListing :key="category" :category="category" />
</template>
