<script setup lang="ts">
import { CheckPromptAvailability, DownloadModel, createChatProvider } from "xsai-chromium-prompt";

import { ref, onMounted, toRaw, computed } from "vue";
import { generateText } from "@xsai/generate-text";
import { streamText } from "@xsai/stream-text";
import type { Message } from '@xsai/shared-chat'

import { useDark, useToggle } from '@vueuse/core'
import Progress from "./components/Progress.vue";

const isDark = useDark()
const toggleDark = useToggle(isDark)

// Check Availability
const availability = ref("unavailable");
const downloadModelProgress = ref(0)

onMounted(async () => {
  const availabilityNow = await CheckPromptAvailability();
  availability.value = availabilityNow;
  if (availabilityNow === "available") downloadModelProgress.value = 1
})

async function download() {
  const resultAvailability = await DownloadModel((p) => downloadModelProgress.value = p)
  availability.value = resultAvailability
}

// conversation
const systemPromptInput = ref('')
const userInput = ref('')
const isExecuting = ref(false)
// not include System Prompt
const contextMessages = ref<Message[]>([])
const isStream = ref(false)
const streamOutput = ref('')

async function execute() {
  const chatProvider = createChatProvider()
  isExecuting.value = true
  // backup user input
  let tempUserInput = userInput.value
  userInput.value = ""
  // Convert Vue reactive Messages to plain objects for structuredClone.
  let pureMessages = structuredClone(toRaw(contextMessages.value)) as Message[]
  // Construct System Prompt Message
  if(pureMessages.length==0 && systemPromptInput.value){
    const systemPromptMessage:Message = {
      'role':'system',
      'content':systemPromptInput.value
    }
    pureMessages = [systemPromptMessage,...pureMessages]
  }
  const userMessage:Message = {
    'role':'user',
    'content':tempUserInput,
  }
  pureMessages = [...pureMessages,userMessage]
  contextMessages.value = pureMessages
  try {
    const { messages } = await generateText({ ...chatProvider.chat(), messages: pureMessages })
    contextMessages.value = messages
  }catch{
    userInput.value = tempUserInput
  }finally {
    isExecuting.value = false
  }
}

function clean(){
  contextMessages.value = []
  userInput.value = ""
  systemPromptInput.value = ""
}

// render
const contextMessagesWithoutSystemPrompt = computed(()=>
  contextMessages.value.filter(i=> i.role != 'system' && i.role != 'developer')
)

</script>

<template>
  <div mx-auto max-w-screen-lg flex flex-col gap-2 p-4>
    <header flex flex-row items-center justify-between>
      <h1 text-2xl>
        <a href="https://github.com/moeru-ai/xsai">xsAI</a> + <a
          href="https://huggingface.co/docs/transformers.js/index">🤗 Transformers.js</a> Provider Playground
      </h1>
      <div flex flex-row items-center gap-2>
        <button text-lg @click="() => toggleDark()">
          <div v-if="isDark" i-solar:moon-stars-bold-duotone />
          <div v-else i-solar:sun-bold />
        </button>
        <a href="https://github.com/moeru-ai/xsai-transformers">
          <div i-simple-icons:github />
        </a>
      </div>
    </header>
    <div flex flex-col gap-2>
      <h2 text-xl>
        Status
      </h2>
      <div w-full flex flex-row gap-2>
        <div w-full>
          <Progress :percentage="downloadModelProgress * 100" :text="availability" />
        </div>
        <button rounded-lg bg="blue-100 dark:blue-900" px-4 py-2 @click="download">
          Download
        </button>
      </div>
    </div>
    <div flex flex-col gap-2>
      <h2 text-xl>
        System Prompt
      </h2>
      <div>
        <textarea v-model="systemPromptInput" h-full w-full rounded-lg bg="neutral-100 dark:neutral-800" p-4
          font-mono :disabled="contextMessages.length>0" />
      </div>
    </div>
    <div flex flex-col gap-2>
      <h2 text-xl>
        Conversion
      </h2>
      <div>
        <textarea v-model="userInput" h-full w-full rounded-lg bg="neutral-100 dark:neutral-800" p-4
          font-mono />
      </div>
      <div flex flex-row gap-2>
        <button rounded-lg bg="blue-100 dark:blue-900" px-4 py-2 flex items-center gap-2 @click="execute"
          :disabled="isExecuting||userInput===''">
          <template v-if="isExecuting">
            <div i-svg-spinners:180-ring />
            <span>Generating...</span>
          </template>
          <template v-else>
            Chat
          </template>
        </button>
        <button rounded-lg bg="blue-100 dark:blue-900" px-4 py-2 flex items-center gap-2 @click="clean"
          :disabled="isExecuting">
          Clean
        </button>
      </div>
    </div>
    <ol flex flex-col gap-6 v-for="msg in contextMessagesWithoutSystemPrompt" >
      <li flex flex-col gap-2>
        <h4 text-lg><b>{{ msg.role }}</b></h4>
        <div>{{ msg.content }}</div>
      </li>
    </ol>
  </div>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
  overscroll-behavior: none;
}

html {
  background: #fff;
  transition: all 0.3s ease-in-out;
}

html.dark {
  background: #121212;
  color-scheme: dark;
}
</style>