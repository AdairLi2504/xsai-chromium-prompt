/// <reference types="dom-chromium-ai" />

import type { GenerateTextResponse } from '@xsai/generate-text'
import type { CommonRequestOptions } from '@xsai/shared'
import type { AudioContentPart, ChatOptions, CommonContentPart, ImageContentPart, Message, RefusalContentPart } from '@xsai/shared-chat'
import type { StreamTextChunkResult } from '@xsai/stream-text'

// Copy from dom-chromium-ai

export type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable'

export type LanguageModelCreateCoreOptions = LanguageModelSamplingOptions & {
  expectedInputs?: LanguageModelExpected[]
  expectedOutputs?: LanguageModelExpected[]
  tools?: LanguageModelTool[]
}

export interface LanguageModelExpected {
  languages?: string[]
  type: LanguageModelMessageType
}

export type LanguageModelSamplingMode
  = | 'balanced'
    | 'creative'
    | 'most-creative'
    | 'most-predictable'
    | 'predictable'

/**
 * samplingMode and the raw sampling params (topK, temperature) are mutually exclusive.
 * Providing both results in a TypeError at runtime.
 * Note: topK and temperature are only available in Chrome extension contexts (Chrome 151+).
 */
export type LanguageModelSamplingOptions
  = | { samplingMode?: LanguageModelSamplingMode, temperature?: never, topK?: never }
    | {
      samplingMode?: never
      /** @deprecated Restricted to web extension contexts only. */
      temperature?: number
      /** @deprecated Restricted to web extension contexts only. */
      topK?: number
    }

export interface LanguageModelTool {
  description: string
  execute: LanguageModelToolFunction
  inputSchema: object
  name: string
}

export interface LanguageModelToolFunction {
  (...args: any[]): Promise<string>
}

// The model should be decided by the user or chrome itself.
// eslint-disable-next-line unused-imports/no-unused-vars
interface ChatProvider<T = string> {
  chat: () => CommonRequestOptions
}

type LanguageModelMessageType = 'audio' | 'image' | 'text'

export async function checkPromptAvailability(options?: LanguageModelCreateCoreOptions): Promise<Availability> {
  try {
    return await LanguageModel.availability(options)
  }
  catch {
    return 'unavailable'
  }
}

// max of the progress is 1
export async function downloadModel(onProgress?: (progress: number) => void, options?: LanguageModelCreateCoreOptions): Promise<Availability> {
  const availability = await checkPromptAvailability(options)
  switch (availability) {
    case 'available':
      if (onProgress)
        onProgress(1)
      return 'available'
    case 'downloadable':
    case 'downloading':{
      const entireOption: LanguageModelCreateOptions = { ...options }
      if (onProgress) {
        entireOption.monitor = m =>
          m.addEventListener('downloadprogress', e => onProgress(e.loaded))
      }
      await LanguageModel.create(entireOption)
      return 'downloading'
    }
    case 'unavailable':
    default:
      return availability
  }
}

// Because of the format of messages is different between chromium

async function convertAudioContentToAudioBuffer(content: AudioContentPart): Promise<AudioBuffer> {
  const binaryString = window.atob(content.input_audio.data)
  const bytes = Uint8Array.from(binaryString, ch => ch.charCodeAt(0))
  const arrayBuffer = bytes.buffer
  const audioContext = new window.AudioContext()
  return audioContext.decodeAudioData(arrayBuffer)
}

async function convertImageContentToImageBitmapSource(content: ImageContentPart): Promise<ImageBitmap> {
  const res = await fetch(content.image_url.url)
  if (!res.ok)
    throw new Error('FailedToGetImage')
  const blob = await res.blob()
  return createImageBitmap(blob)
}

async function convertXsaiContentToPromptApiContent(content: (CommonContentPart | RefusalContentPart)[] | string): Promise<LanguageModelMessageContent[] | string> {
  if (typeof content === 'string') {
    return content
  }
  else if (typeof content === 'object') {
    const promptContent: LanguageModelMessageContent[] = []
    for (const contentItem of content) {
      switch (contentItem.type) {
        case 'image_url':
          promptContent.push({
            type: 'image',
            value: await convertImageContentToImageBitmapSource(contentItem),
          })
          break
        case 'input_audio':
          promptContent.push({
            type: 'audio',
            value: await convertAudioContentToAudioBuffer(contentItem),
          })
          break
        case 'text':
          promptContent.push({
            type: 'text',
            value: contentItem.text,
          })
          break
      }
    }
    return promptContent
  }
  else {
    return ''
  }
}

async function convertXsaiToPromptApi(messages: Message[]): Promise<{ promptMessages: LanguageModelMessage[], systemMessage: LanguageModelSystemMessage | null | undefined }> {
  let systemMessage: LanguageModelSystemMessage | null = null
  const promptMessages: LanguageModelMessage[] = []
  let startIndex = 0

  if (messages.length > 0) {
    const possibleSystemMessage = messages[0]
    if (possibleSystemMessage && (possibleSystemMessage.role === 'developer' || possibleSystemMessage.role === 'system')) {
      systemMessage = {
        content: await convertXsaiContentToPromptApiContent(possibleSystemMessage.content),
        role: 'system',
      }
      startIndex = 1
    }

    for (let i = startIndex; i < messages.length; i++) {
      const messageItem = messages[i]
      switch (messageItem.role) {
        case 'assistant':
          if (messageItem.content) {
            promptMessages.push({
              content: await convertXsaiContentToPromptApiContent(messageItem.content),
              role: 'assistant',
            })
          }
          break
        case 'user':
          promptMessages.push({
            content: await convertXsaiContentToPromptApiContent(messageItem.content),
            role: 'user',
          })
      }
    }
  }
  return { promptMessages, systemMessage }
}

export const createChatProvider = (options?: LanguageModelCreateCoreOptions): ChatProvider => {
  interface PromptAIOption extends ChatOptions {
    stream?: boolean
  }
  return {
    chat: () => Object.assign({
      baseURL: 'https://chromium-prompt.local/v1',
      fetch: async (_: any, init: RequestInit) => {
        const initBody = init.body?.toString() || '{}'
        const body: PromptAIOption = JSON.parse(initBody)
        const { promptMessages, systemMessage } = await convertXsaiToPromptApi(body.messages)
        // Create a fresh copy of options for each request to ensure isolated context
        const createOption: LanguageModelCreateOptions = structuredClone(options ?? {})
        if (systemMessage)
          createOption.initialPrompts = [systemMessage]
        const session = await LanguageModel.create(createOption)
        const resId = crypto.randomUUID()
        const encoder = new TextEncoder()
        if (body.stream) {
          const streamCompletion = session.promptStreaming(promptMessages)
          const sseStream = new ReadableStream({
            async start(controller) {
              // eslint-disable-next-line sonarjs/no-nested-functions
              const enqueueSseEvent = (event: StreamTextChunkResult) => {
                // eslint-disable-next-line @masknet/string-no-data-url
                controller.enqueue(encoder.encode(`data:${JSON.stringify(event)}\n\n`))
              }
              for await (const chunk of streamCompletion) {
                const eventData: StreamTextChunkResult = {
                  choices: [{
                    delta: { content: chunk, role: 'assistant' },
                    finish_reason: undefined,
                    index: 0,
                  }],
                  created: Math.floor(Date.now() / 1000),
                  id: resId,
                  model: 'chromium-prompt-API',
                  object: 'chat.completion.chunk',
                  system_fingerprint: '',
                  usage: {
                    completion_tokens: 0,
                    prompt_tokens: session.contextUsage,
                    total_tokens: session.contextUsage,
                  },
                }
                enqueueSseEvent(eventData)
              }
              const finalEvent: StreamTextChunkResult = {
                choices: [{
                  delta: { role: 'assistant' },
                  finish_reason: 'stop',
                  index: 0,
                }],
                created: Math.floor(Date.now() / 1000),
                id: resId,
                model: 'chromium-prompt-API',
                object: 'chat.completion.chunk',
                system_fingerprint: '',
                usage: {
                  completion_tokens: 0,
                  prompt_tokens: session.contextUsage,
                  total_tokens: session.contextUsage,
                },
              }
              enqueueSseEvent(finalEvent)
              controller.close()
            },
          })
          return new Response(sseStream, {
            headers: {
              'Content-Type': 'text/event-stream',
            },
          })
        }
        else {
          const completion = await session.prompt(promptMessages)
          const res: GenerateTextResponse = {
            choices: [{
              finish_reason: 'stop',
              index: 0,
              message: {
                content: completion,
                role: 'assistant',
              },
            }],
            created: Math.floor(Date.now() / 1000),
            id: resId,
            model: 'chromium-prompt-API',
            object: 'chat.completion',
            system_fingerprint: '',
            usage: {
              completion_tokens: 0,
              prompt_tokens: session.contextUsage,
              total_tokens: session.contextUsage,
            },
          }
          return new Response((encoder.encode(JSON.stringify(res))))
        }
      },

      // 'model' and 'baseURL' are mandatory
      model: 'chromium-prompt-API',
    }),
  }
}
