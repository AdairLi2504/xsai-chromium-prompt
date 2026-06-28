<script setup lang="ts">
import { CheckPromptAvailability,createChatProvider } from "xsai-chromium-prompt";

import { ref, onMounted } from "vue";
import { generateText } from "@xsai/generate-text";

// Check Availability
const availability = ref("unavailable"); 

onMounted(async () => {
  const resultAvailability = await CheckPromptAvailability();
  availability.value = resultAvailability;
})

</script>

<template>
  <h1>You did it!</h1>
  <p>
    Visit <a href="https://vuejs.org/" target="_blank" rel="noopener">vuejs.org</a> 
    to read the documentation
  </p>
  <p>AI 状态: {{ availability }}</p>
</template>
