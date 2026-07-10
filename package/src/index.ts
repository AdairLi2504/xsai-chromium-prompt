/// <reference types="dom-chromium-ai" />

import type { ChatOptions, CommonContentPart, Message, RefusalContentPart, AudioContentPart, ImageContentPart } from '@xsai/shared-chat'
import type { GenerateTextResponse } from "@xsai/generate-text";
import type { CommonRequestOptions } from "@xsai/shared"
import type { StreamTextChunkResult } from '@xsai/stream-text'

// Copy from dom-chromium-ai

export type Availability = "unavailable" | "downloadable" | "downloading" | "available"

export type LanguageModelSamplingMode =
	| "most-predictable"
	| "predictable"
	| "balanced"
	| "creative"
	| "most-creative"

/**
 * samplingMode and the raw sampling params (topK, temperature) are mutually exclusive.
 * Providing both results in a TypeError at runtime.
 * Note: topK and temperature are only available in Chrome extension contexts (Chrome 151+).
 */
export type LanguageModelSamplingOptions =
	| { samplingMode?: LanguageModelSamplingMode; topK?: never; temperature?: never }
	| {
		samplingMode?: never;
		/** @deprecated Restricted to web extension contexts only. */
		topK?: number;
		/** @deprecated Restricted to web extension contexts only. */
		temperature?: number;
	}

export type LanguageModelCreateCoreOptions = {
	expectedInputs?: LanguageModelExpected[];
	expectedOutputs?: LanguageModelExpected[];
	tools?: LanguageModelTool[];
} & LanguageModelSamplingOptions

export interface LanguageModelExpected {
	type: LanguageModelMessageType;
	languages?: string[];
}

type LanguageModelMessageType = "text" | "image" | "audio";

export interface LanguageModelTool {
	name: string;
	description: string;
	inputSchema: object;
	execute: LanguageModelToolFunction;
}

export interface LanguageModelToolFunction {
	(...args: any[]): Promise<string>;
}

export async function checkPromptAvailability(options?: LanguageModelCreateCoreOptions): Promise<Availability> {
	let availability: Availability;
	try {
		availability = await LanguageModel.availability(options);
	} catch {
		availability = "unavailable" as Availability;
	}
	return availability;
}

// max of the progress is 1
export async function downloadModel(onProgress?: (progress: number) => void, options?: LanguageModelCreateCoreOptions): Promise<Availability> {
	let availability = await checkPromptAvailability(options)
	switch (availability) {
		case 'available':
			if (onProgress) onProgress(1)
			return 'available'
		case 'downloading':
		case 'downloadable':
			const entireOption: LanguageModelCreateOptions = { ...options }
			if (onProgress) entireOption.monitor = (m) =>
				m.addEventListener('downloadprogress', (e) => onProgress(e.loaded))
			await LanguageModel.create(entireOption)
			return 'downloading'
		case 'unavailable':
		default:
			return availability
	}
}

// The model should be decided by the user or chrome itself.
interface ChatProvider<T = string> {
	chat: () => CommonRequestOptions;
}

// Because of the format of messages is different between chromium

async function convertAudioContentToAudioBuffer(content: AudioContentPart): Promise<AudioBuffer> {
	const binaryString = window.atob(content.input_audio.data)
	const bytes = new Uint8Array(binaryString.length)
	for (let i = 0; i < binaryString.length; i++) 
		bytes[i] = binaryString.charCodeAt(i)
	const arrayBuffer = bytes.buffer
	const audioContext = new window.AudioContext();
	return audioContext.decodeAudioData(arrayBuffer)
}

async function convertImageContentToImageBitmapSource(content: ImageContentPart):Promise<ImageBitmap> {
	const res = await fetch(content.image_url.url)
	if(!res.ok) throw new Error('FailedToGetImage')
	const blob = await res.blob()
	return createImageBitmap(blob)
}

async function convertXsaiContentToPromptApiContent(content: string | (CommonContentPart | RefusalContentPart)[]): Promise<string | LanguageModelMessageContent[]> {
	if (typeof content === "string") {
		return content
	} else if (typeof content === "object") {
		let promptContent: LanguageModelMessageContent[] = []
		for (const contentItem of content) {
			switch (contentItem.type) {
				case 'text':
					promptContent.push({
						type: 'text',
						value: contentItem.text
					}); break
				case 'input_audio':
					promptContent.push({
						type:'audio',
						value: await convertAudioContentToAudioBuffer(contentItem)
					}); break
				case 'image_url':
					promptContent.push({
						type:'image',
						value: await convertImageContentToImageBitmapSource(contentItem)
					}); break
			}
		}
		return promptContent
	} else {
		return ""
	}
}

async function convertXsaiToPromptApi(messages: Message[]): Promise<{ promptMessages: LanguageModelMessage[]; systemMessage: LanguageModelSystemMessage | null | undefined; }> {
	let systemMessage: LanguageModelSystemMessage | null = null
	let promptMessages: LanguageModelMessage[] = []
	if (messages.length > 0) {
		const possibleSystemMessage = messages[0]
		if (possibleSystemMessage && (possibleSystemMessage.role === "developer" || possibleSystemMessage.role === "system")) {
			systemMessage = {
				role: 'system',
				content: await convertXsaiContentToPromptApiContent(possibleSystemMessage.content)
			}
			messages.shift()
		}
		for (const messageItem of messages) {
			switch (messageItem.role) {
				case 'assistant':
					if (messageItem.content)
						promptMessages.push({
							role: 'assistant',
							content: await convertXsaiContentToPromptApiContent(messageItem.content)
						}); break
				case 'user':
					promptMessages.push({
						role: 'user',
						content: await convertXsaiContentToPromptApiContent(messageItem.content)
					})
			}
		}
	}
	return { promptMessages: promptMessages, systemMessage: systemMessage }
}

export const createChatProvider = (options?: LanguageModelCreateCoreOptions): ChatProvider => {
	interface PromptAIOption extends ChatOptions {
		stream?: boolean
	}
	return {
		chat: () => Object.assign({
			// 'model' and 'baseURL' are mandatory
			model: 'chromium-prompt-API',
			baseURL: 'https://chromium-prompt.local/v1',

			fetch: async (_: any, init: RequestInit) => {
				const initBody = init.body?.toString() || '{}'
				const body: PromptAIOption = JSON.parse(initBody)
				const { promptMessages, systemMessage } = await convertXsaiToPromptApi(body.messages)
				const createOption: LanguageModelCreateOptions = options ?? {}
				if (systemMessage) createOption.initialPrompts = [systemMessage]
				const session = await LanguageModel.create(createOption)
				const resId = crypto.randomUUID()
				const encoder = new TextEncoder()
				if (body.stream) {
					const streamCompletion = session.promptStreaming(promptMessages)
					const sseStream = new ReadableStream({
						async start(controller) {
							const enqueueSseEvent = (event: StreamTextChunkResult) => {
								controller.enqueue(encoder.encode(`data:${JSON.stringify(event)}\n\n`))
							}
							for await (const chunk of streamCompletion) {
								const eventData: StreamTextChunkResult = {
									id: resId,
									created: Math.floor(Date.now() / 1000),
									model: 'chromium-prompt-API',
									object: 'chat.completion.chunk',
									system_fingerprint: '',
									usage: {
										prompt_tokens: session.contextUsage,
										completion_tokens: 0,
										total_tokens: session.contextUsage
									},
									choices: [{
										index: 0,
										finish_reason: undefined,
										delta: { role: 'assistant', content: chunk }
									}]
								}
								enqueueSseEvent(eventData)
							}
							const finalEvent: StreamTextChunkResult = {
								id: resId,
								created: Math.floor(Date.now() / 1000),
								model: 'chromium-prompt-API',
								object: 'chat.completion.chunk',
								system_fingerprint: '',
								usage: {
									prompt_tokens: session.contextUsage,
									completion_tokens: 0,
									total_tokens: session.contextUsage
								},
								choices: [{
									index: 0,
									finish_reason: 'stop',
									delta: { role: 'assistant' }
								}]
							}
							enqueueSseEvent(finalEvent)
							controller.close()
						}
					})
					return new Response(sseStream, {
						headers: {
							'Content-Type': 'text/event-stream',
						},
					});
				} else {
					const completion = await session.prompt(promptMessages)
					const res: GenerateTextResponse = {
						id: resId,
						created: Math.floor(Date.now() / 1000),
						model: 'chromium-prompt-API',
						object: 'chat.completion',
						system_fingerprint: '',
						usage: {
							prompt_tokens: session.contextUsage,
							completion_tokens: 0,
							total_tokens: session.contextUsage
						},
						choices: [{
							finish_reason: 'stop',
							index: 0,
							message: {
								role: 'assistant',
								content: completion
							}
						}]
					}
					return new Response((encoder.encode(JSON.stringify(res))))
				}
			},
		})
	}

}