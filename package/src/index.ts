/// <reference types="dom-chromium-ai" />

import type { ChatOptions, CommonContentPart, Message, RefusalContentPart } from '@xsai/shared-chat'
import type { GenerateTextResponse } from "@xsai/generate-text";
import type { CommonRequestOptions } from "@xsai/shared"

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

export interface LanguageModelTool {
	name: string;
	description: string;
	inputSchema: object;
	execute: LanguageModelToolFunction;
}

export interface LanguageModelToolFunction {
	(...args: any[]): Promise<string>;
}

export async function CheckPromptAvailability(options?: LanguageModelCreateCoreOptions): Promise<Availability> {
	let availability: Availability;
	try {
		availability = await LanguageModel.availability(options);
	} catch {
		availability = "unavailable" as Availability;
	}
	return availability;
}

// max of the progress is 1
export async function DownloadModel(options?: LanguageModelCreateCoreOptions, onProgress?: (progress: number) => void): Promise<Availability> {
	let availability = await CheckPromptAvailability(options)
	switch (availability) {
		case 'available':
			if (onProgress) onProgress(1)
		case 'unavailable':
			return availability
		case 'downloading':
		case 'downloadable':
			const entireOption: LanguageModelCreateOptions = { ...options }
			if (onProgress) entireOption.monitor = (m) =>
				m.addEventListener('downloadprogress', (e) => onProgress(e.loaded))
			await LanguageModel.create(entireOption)
			return 'downloading'
	}
}

// The model should be decided by the user or chrome itself.
interface ChatProvider<T = string> {
    chat: () => CommonRequestOptions;
}

// Because of the format of messages is different between chromium

function convertXsaiContentToPromptApiContent(content: string | (CommonContentPart | RefusalContentPart)[]): LanguageModelMessageContent[] | string {
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
			}
		}
		return promptContent
	} else {
		return ""
	}
}

function convertXsaiToPromptApi(messages: Message[]): { promptMessages: LanguageModelMessage[], systemMessage: LanguageModelSystemMessage | null | undefined } {
	let systemMessage: LanguageModelSystemMessage | null = null
	let promptMessages: LanguageModelMessage[] = []
	if (messages.length > 0) {
		const possibleSystemMessage = messages[0]
		if (possibleSystemMessage && (possibleSystemMessage.role === "developer" || possibleSystemMessage.role === "system")) {
			systemMessage = {
				role: 'system',
				content: convertXsaiContentToPromptApiContent(possibleSystemMessage.content)
			}
			messages.shift()
		}
		for (const messageItem of messages) {
			switch (messageItem.role) {
				case 'assistant':
					if (messageItem.content)
						promptMessages.push({
							role: 'assistant',
							content: convertXsaiContentToPromptApiContent(messageItem.content)
						}); break
				case 'user':
					promptMessages.push({
						role: 'user',
						content: convertXsaiContentToPromptApiContent(messageItem.content)
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
			model: 'chromium-prompt-API',
			baseURL: 'https://chromium-prompt.local/v1',
			fetch: async (_: any, init: RequestInit) => {
				const initBody = init.body?.toString() || '{}'
				const body: PromptAIOption = JSON.parse(initBody)
				const { promptMessages, systemMessage } = convertXsaiToPromptApi(body.messages)
				const createOption: LanguageModelCreateOptions = options ?? {}
				if (systemMessage) createOption.initialPrompts = [systemMessage]
				const session = await LanguageModel.create(createOption)
				const resId = crypto.randomUUID()
				if (body.stream) {

				} else {
					const completion = await session.prompt(promptMessages)
					const res: GenerateTextResponse = {
						id: resId,
						created: Date.now(),
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
					const encoder = new TextEncoder()
					return new Response((encoder.encode(JSON.stringify(res))))
				}
			},
		})
	}

}