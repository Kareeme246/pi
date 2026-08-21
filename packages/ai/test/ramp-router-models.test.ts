import { describe, expect, it } from "vitest";
import {
	isSelectableRampRouterModel,
	type RampRouterModelEntry,
	toRampRouterModel,
} from "../src/providers/ramp-router-config.ts";

// Fixtures trimmed from a real `GET https://api.router.com/v1/models` response.
const CLAUDE_SONNET_5: RampRouterModelEntry = {
	id: "claude-sonnet-5",
	router: {
		status: "active",
		display_name: "Claude Sonnet 5",
		limits: { context_window: 1000000, max_output_tokens: 128000 },
		capabilities: {
			modalities: { input: ["image", "text"] },
			tools: { supported: true },
			reasoning: {
				supported: true,
				efforts: [
					{ value: "none" },
					{ value: "minimal" },
					{ value: "low" },
					{ value: "medium" },
					{ value: "high" },
					{ value: "xhigh" },
					{ value: "max" },
				],
			},
		},
		pricing: {
			input: "2",
			output: "10",
			cache_read_input: "0.2",
			cache_write_input: "0",
			cache_write_input_5m: "2.5",
		},
	},
};

// reasoning.supported is true but efforts is empty: not actually configurable.
const GROK_BUILD: RampRouterModelEntry = {
	id: "grok-build-0.1",
	router: {
		status: "active",
		display_name: "Grok Build 0.1",
		limits: { context_window: 256000, max_output_tokens: 256000 },
		capabilities: {
			modalities: { input: ["image", "text"] },
			tools: { supported: true },
			reasoning: { supported: true, efforts: [] },
		},
		pricing: { input: "1", output: "2", cache_read_input: "0.2", cache_write_input: "0", cache_write_input_5m: "0" },
	},
};

const GPT_4O: RampRouterModelEntry = {
	id: "gpt-4o",
	router: {
		status: "active",
		display_name: "GPT-4o",
		limits: { context_window: 128000, max_output_tokens: 16384 },
		capabilities: {
			modalities: { input: ["image", "text"] },
			tools: { supported: true },
			reasoning: { supported: false, efforts: [] },
		},
		pricing: {
			input: "2.5",
			output: "10",
			cache_read_input: "1.25",
			cache_write_input: "0",
			cache_write_input_5m: "0",
		},
	},
};

// No 5-minute cache-write price; only the base cache_write_input is non-zero.
const GPT_5_6_LUNA: RampRouterModelEntry = {
	id: "gpt-5.6-luna",
	router: {
		status: "active",
		display_name: "GPT-5.6 Luna",
		limits: { context_window: 1050000, max_output_tokens: 128000 },
		capabilities: {
			modalities: { input: ["image", "text"] },
			tools: { supported: true },
			reasoning: {
				supported: true,
				efforts: [
					{ value: "none" },
					{ value: "low" },
					{ value: "medium" },
					{ value: "high" },
					{ value: "xhigh" },
					{ value: "max" },
				],
			},
		},
		pricing: {
			input: "1",
			output: "6",
			cache_read_input: "0.1",
			cache_write_input: "1.25",
			cache_write_input_5m: "0",
		},
	},
};

const GPT_OSS_20B_NO_TOOLS: RampRouterModelEntry = {
	id: "accounts/fireworks/models/gpt-oss-20b",
	router: {
		status: "active",
		display_name: "OpenAI gpt-oss-20b",
		limits: { context_window: 131072, max_output_tokens: 131072 },
		capabilities: {
			modalities: { input: ["text"] },
			tools: { supported: false },
			reasoning: { supported: true, efforts: [{ value: "none" }, { value: "minimal" }] },
		},
		pricing: {
			input: "0.07",
			output: "0.3",
			cache_read_input: "0.035",
			cache_write_input: "0",
			cache_write_input_5m: "0",
		},
	},
};

const GPT_4_1_NANO_DEPRECATED: RampRouterModelEntry = {
	id: "gpt-4.1-nano",
	router: {
		status: "deprecated",
		display_name: "GPT-4.1 nano",
		limits: { context_window: 1047576, max_output_tokens: 32768 },
		capabilities: {
			modalities: { input: ["image", "text"] },
			tools: { supported: true },
			reasoning: { supported: false, efforts: [] },
		},
		pricing: {
			input: "0.1",
			output: "0.4",
			cache_read_input: "0.025",
			cache_write_input: "0",
			cache_write_input_5m: "0",
		},
	},
};

describe("toRampRouterModel", () => {
	it("maps a reasoning model with a full effort ladder", () => {
		const model = toRampRouterModel(CLAUDE_SONNET_5);
		expect(model.id).toBe("claude-sonnet-5");
		expect(model.name).toBe("Claude Sonnet 5");
		expect(model.api).toBe("openai-responses");
		expect(model.provider).toBe("ramp-router");
		expect(model.reasoning).toBe(true);
		expect(model.input).toEqual(["image", "text"]);
		expect(model.contextWindow).toBe(1000000);
		expect(model.maxTokens).toBe(128000);
		expect(model.cost).toEqual({ input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 });
		expect(model.thinkingLevelMap).toEqual({
			off: "none",
			minimal: "minimal",
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "xhigh",
			max: "max",
		});
	});

	it("hides thinking levels the model does not report", () => {
		const model = toRampRouterModel(GPT_5_6_LUNA);
		expect(model.thinkingLevelMap?.minimal).toBeNull();
		expect(model.thinkingLevelMap?.off).toBe("none");
		expect(model.thinkingLevelMap?.high).toBe("high");
	});

	it("falls back to the base cache-write price when the 5-minute price is zero", () => {
		const model = toRampRouterModel(GPT_5_6_LUNA);
		expect(model.cost.cacheWrite).toBe(1.25);
	});

	it("treats reasoning.supported without any efforts as non-reasoning", () => {
		const model = toRampRouterModel(GROK_BUILD);
		expect(model.reasoning).toBe(false);
		expect(model.thinkingLevelMap).toBeUndefined();
	});

	it("maps a non-reasoning model", () => {
		const model = toRampRouterModel(GPT_4O);
		expect(model.reasoning).toBe(false);
		expect(model.thinkingLevelMap).toBeUndefined();
		expect(model.input).toEqual(["image", "text"]);
	});
});

describe("isSelectableRampRouterModel", () => {
	it("accepts active, tool-capable models", () => {
		expect(isSelectableRampRouterModel(CLAUDE_SONNET_5)).toBe(true);
	});

	it("rejects models without tool support", () => {
		expect(isSelectableRampRouterModel(GPT_OSS_20B_NO_TOOLS)).toBe(false);
	});

	it("rejects deprecated models", () => {
		expect(isSelectableRampRouterModel(GPT_4_1_NANO_DEPRECATED)).toBe(false);
	});
});
