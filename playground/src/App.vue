<script setup lang="ts">
import type { CommonContentPart, Message } from '@xsai/shared-chat'

import { useDark, useToggle } from '@vueuse/core'
import { generateText } from '@xsai/generate-text'
import { streamText } from '@xsai/stream-text'
import { computed, onMounted, ref, toRaw } from 'vue'
import { checkPromptAvailability, createChatProvider, downloadModel } from 'xsai-chromium-prompt'

import InputFile from './components/InputFile.vue'
import Progress from './components/Progress.vue'

const isDark = useDark()
const toggleDark = useToggle(isDark)

// Check Availability
const availability = ref('unavailable')
const downloadModelProgress = ref(0)

onMounted(async () => {
  const availabilityNow = await checkPromptAvailability()
  availability.value = availabilityNow
  if (availabilityNow === 'available')
    downloadModelProgress.value = 1
})

async function download() {
  const resultAvailability = await downloadModel(p => downloadModelProgress.value = p)
  availability.value = resultAvailability
}

// conversation
const systemPromptInput = ref('')
const userInput = ref('')
const isExecuting = ref(false)
const filesInput = ref<File[]>([])

// input files

function deleteFile(file: File) {
  filesInput.value = filesInput.value.filter(i => i !== file)
}

function handleFilesChange(files: File[]) {
  filesInput.value = [...filesInput.value, ...files]
}

// not include System Prompt
const contextMessages = ref<Message[]>([])
const isStream = ref(false)
const streamOutput = ref('')

function clean() {
  contextMessages.value = []
  userInput.value = ''
  systemPromptInput.value = ''
}

const chatProvider = createChatProvider({ expectedInputs: [{ type: 'audio' }, { type: 'image' }] })

async function execute() {
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        resolve(dataUrl)
      }
      reader.onerror = error => reject(error)
      reader.readAsDataURL(file)
    })
  }
  function isWav(type: string) {
    const AUDIO_WAV = new Set<string>(['audio/vnd.wave', 'audio/wav', 'audio/x-wav'])
    return AUDIO_WAV.has(type)
  }
  async function convertFilesToContentParts(files: File[]): Promise<CommonContentPart[]> {
    const parts: CommonContentPart[] = []
    for (const f of files) {
      if (f.type === 'audio/mpeg') {
        const base64 = await fileToBase64(f)
        parts.push({
          input_audio: { data: base64.split(',')[1] as string, format: 'mp3' },
          type: 'input_audio',
        })
      }
      else if (isWav(f.type)) {
        const base64 = await fileToBase64(f)
        parts.push({
          input_audio: { data: base64.split(',')[1] as string, format: 'wav' },
          type: 'input_audio',
        })
      }
      else if (f.type.startsWith('image/')) {
        const base64 = await fileToBase64(f)
        parts.push({
          image_url: { url: base64 },
          type: 'image_url',
        })
      }
      else {
        throw new Error('UnsupportedFile')
      }
    }
    return parts
  }

  isExecuting.value = true
  streamOutput.value = ''

  const tempUserInput = userInput.value
  userInput.value = ''
  const tempFileInput = filesInput.value
  filesInput.value = []

  let pureMessages = structuredClone(toRaw(contextMessages.value)) as Message[]
  if (pureMessages.length === 0 && systemPromptInput.value) {
    pureMessages = [
      { content: systemPromptInput.value, role: 'system' },
      ...pureMessages,
    ]
  }
  let contentInput: CommonContentPart[] | string
  try {
    if (tempFileInput.length > 0) {
      const parts = await convertFilesToContentParts(tempFileInput)
      parts.push({ text: tempUserInput, type: 'text' })
      contentInput = parts
    }
    else {
      contentInput = tempUserInput
    }
  }
  catch {
    userInput.value = tempUserInput
    filesInput.value = tempFileInput
    isExecuting.value = false
    alert('Unsupported File! Only mp3/wav Audio and Image Are Acceptable')
    return
  }

  const userMessage: Message = { content: contentInput, role: 'user' }
  pureMessages = [...pureMessages, userMessage]
  contextMessages.value = pureMessages

  try {
    if (isStream.value) {
      const { messages, textStream } = streamText({
        ...chatProvider.chat(),
        messages: pureMessages,
      })
      for await (const textPart of textStream) {
        streamOutput.value += textPart
      }
      contextMessages.value = await messages
    }
    else {
      const { messages } = await generateText({
        ...chatProvider.chat(),
        messages: pureMessages,
      })
      contextMessages.value = messages
    }
  }
  catch {
    userInput.value = tempUserInput
    filesInput.value = tempFileInput
  }
  finally {
    isExecuting.value = false
  }
}

// render
const contextMessagesWithoutSystemPrompt = computed(() =>
  contextMessages.value.filter(i => i.role !== 'system' && i.role !== 'developer'),
)
</script>

<template>
  <div mx-auto max-w-screen-lg flex flex-col gap-2 p-4>
    <header flex flex-row items-center justify-between>
      <h1 text-2xl>
        <a href="https://github.com/moeru-ai/xsai">xsAI</a> + <a
          href="https://developer.chrome.com/docs/ai/prompt-api"
        >🦖 Chromium Prompt API</a> Provider Playground
      </h1>
      <div flex flex-row items-center gap-2>
        <button text-lg @click="() => toggleDark()">
          <div v-if="isDark" i-solar:moon-stars-bold-duotone />
          <div v-else i-solar:sun-bold />
        </button>
        <a href="https://github.com/moeru-ai/xsai-chromium-prompt">
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
        <textarea
          v-model="systemPromptInput" h-full w-full rounded-lg bg="neutral-100 dark:neutral-800" p-4 font-mono
          :disabled="contextMessages.length > 0"
        />
      </div>
    </div>
    <div flex flex-col gap-2>
      <h2 text-xl>
        Conversion
      </h2>
      <div>
        <textarea v-model="userInput" h-full w-full rounded-lg bg="neutral-100 dark:neutral-800" p-4 font-mono />
      </div>
      <ol flex flex-row gap-2 flex-wrap>
        <li
          v-for="f in filesInput"
          :key="`${f.name}-${f.lastModified.toString()}`"
          border-2 rounded-xl py-2 px-4 flex flex-row border-neutral-200 dark:border-neutral-700 gap-1
          items-center
        >
          <button i-at-icons:cross @click="deleteFile(f)" />
          <span>{{ f.name }}</span>
        </li>
      </ol>
      <div flex flex-row gap-2>
        <button
          rounded-lg bg="blue-100 dark:blue-900" px-4 py-2 flex items-center gap-2 :disabled="isExecuting || userInput === '' || availability !== 'available'"
          @click="execute"
        >
          <template v-if="isExecuting">
            <div i-svg-spinners:180-ring />
            <span>Generating...</span>
          </template>
          <template v-else>
            Chat
          </template>
        </button>
        <button
          rounded-lg bg="blue-100 dark:blue-900" px-4 py-2 flex items-center gap-2 :disabled="isExecuting"
          @click="clean"
        >
          Clean
        </button>
        <InputFile px-4 py-2 @update:model-value="handleFilesChange" />
        <div px-4 py-2 flex items-center gap-2>
          <input v-model="isStream" type="checkbox">
          Stream
        </div>
      </div>
    </div>
    <div flex flex-col gap-6>
      <ol
        v-for="msg in contextMessagesWithoutSystemPrompt"
        :key="`${msg.role}-${msg.content?.toString()}`"
        flex flex-col gap-6
      >
        <li flex flex-col gap-2>
          <h4 text-lg>
            <b>{{ msg.role }}</b>
          </h4>
          <div>{{ msg.content }}</div>
        </li>
      </ol>
      <div v-if="isExecuting && isStream" flex flex-col gap-2>
        <h4 text-lg>
          <b>{{ "assistant" }}</b>
        </h4>
        <div>{{ streamOutput }}</div>
      </div>
    </div>
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
