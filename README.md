# xsAI 🦖 Chromium Prompt API Provider

A special [Chromium Prompt API](https://developer.chrome.com/docs/ai/prompt-api) provider for [`xsai`](https://github.com/moeru-ai/xsai), the extra-small AI SDK. Capable of performing tasks of text generations right in the Chromium-based browser (due to 
AI on Chrome)

<!-- automd:badges name="xsai" provider="badgen" color="cyan" license bundlephobia -->

[![npm version](https://flat.badgen.net/npm/v/xsai-chromium-prompt?color=cyan)](https://npmjs.com/package/xsai-chromium-prompt)
[![npm downloads](https://flat.badgen.net/npm/dm/xsai-chromium-prompt?color=cyan)](https://npm.chart.dev/xsai-chromium-prompt)
[![bundle size](https://flat.badgen.net/bundlephobia/minzip/xsai-chromium-prompt?color=cyan)](https://bundlephobia.com/package/xsai-chromium-prompt)
[![license](https://flat.badgen.net/github/license/AdairLi2504/xsai-chromium-prompt?color=cyan)](https://github.com/AdairLi2504/xsai-chromium-prompt/blob/main/LICENSE.md)

<!-- /automd -->

xsAI Chromium Prompt API Provider aligned the API of xsAI:

```ts
import { checkPromptAvailability, createChatProvider } from "xsai-chromium-prompt";
import { generateText } from "@xsai/generate-text";

let availability = checkPromptAvailability()
if(availability=="available"){
	const chatProvider = createChatProvider()
	const { text } = await generateText({ 
		...chatProvider.chat(), 
		messages: [{
      		content: 'Why is the sky blue?',
      		role: 'user'
    	}]
	})
}
```

## Features

`xsai-chromium-prompt` is just a wrapper for [🦖 Chromium Prompt API](https://developer.chrome.com/docs/ai/prompt-api). It enables  `xsai` to interface with Gemini Nano in Chrome. Text is the only avaliable sub-provider due to the limitation of AI on Chrome, whichs means that it can only create a provider for `@xsai/generate-text` and `@xsai/stream-text`.

### Runtime-agnostic

`xsai-chromium-prompt` requires Chromium-based browsers that meets the [hardware requirements](https://developer.chrome.com/docs/ai/prompt-api#hardware-requirements) to deploy Gemini Nano.

## Known Issues

### `downloadModel`

When using the Prompt API download monitor, the progress callback does not return `1.0` upon completion. Instead, it stops at a value slightly below 1.0 (e.g., `0.97`), even though the download has finished successfully. Since that, the `onProgress` arguement will has the same problem that the last call of this function will return a value slightly below 1.0 (e.g., `0.97`) too. 

To solve this problem, you can utillize a lifecycle hook to run `checkPromptAvailability` that detects the availability. When the availability is `available`, set the progress to 1.
The code of the playground gives an example.

### `createChatProvider`

If the availability of the Prompt API is downloadable, the Gemini Nano model file will be downloaded after the `generateText()` or `streamText()` is called.

## Usage

### Install

<!-- automd:pm-install name="xsai" auto=false -->

```sh
# npm
npm install xsai-chromium-prompt

# yarn
yarn add xsai-chromium-prompt

# pnpm
pnpm install xsai-chromium-prompt

# bun
bun install xsai-chromium-prompt

```
<!-- /automd -->

### Examples [(see above)](#xsai--chromium-prompt-api-provider)

### Status

xsAI [Chromium Prompt API](https://developer.chrome.com/docs/ai/prompt-api) is currently in an early stage of development and may introduce breaking changes at any time.

## License

[MIT](LICENSE.md)