import type { Model, ModelThinkingLevel, ThinkingLevelMap } from "../types.ts";

export const RAMP_ROUTER_BASE_URL = "https://api.router.com/v1";

export interface RampRouterModelsResponse {
	data: RampRouterModelEntry[];
}

export interface RampRouterModelEntry {
	id: string;
	router: {
		status: string;
		display_name: string;
		limits: {
			context_window: number;
			max_output_tokens: number;
		};
		capabilities: {
			modalities: { input: string[] };
			tools: { supported: boolean };
			reasoning: { supported: boolean; efforts: { value: string }[] };
		};
		pricing: {
			input: string;
			output: string;
			cache_read_input: string;
			cache_write_input: string;
			cache_write_input_5m: string;
		};
	};
}

const THINKING_LEVELS: readonly ModelThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

function buildThinkingLevelMap(efforts: readonly { value: string }[]): ThinkingLevelMap {
	const map: ThinkingLevelMap = {};
	for (const level of THINKING_LEVELS) map[level] = null;
	for (const effort of efforts) {
		const level = effort.value === "none" ? "off" : (effort.value as ModelThinkingLevel);
		if (level in map) map[level] = effort.value;
	}
	return map;
}

function parsePrice(value: string | undefined): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

export function isSelectableRampRouterModel(entry: RampRouterModelEntry): boolean {
	return entry.router.status === "active" && entry.router.capabilities.tools.supported;
}

export function toRampRouterModel(entry: RampRouterModelEntry): Model<"openai-responses"> {
	const { router } = entry;
	const efforts = router.capabilities.reasoning.efforts;
	const reasoning = router.capabilities.reasoning.supported && efforts.length > 0;
	const input = router.capabilities.modalities.input.filter(
		(modality): modality is "text" | "image" => modality === "text" || modality === "image",
	);
	const cacheWrite = parsePrice(router.pricing.cache_write_input_5m) || parsePrice(router.pricing.cache_write_input);

	return {
		id: entry.id,
		name: router.display_name,
		api: "openai-responses",
		provider: "ramp-router",
		baseUrl: RAMP_ROUTER_BASE_URL,
		reasoning,
		...(reasoning ? { thinkingLevelMap: buildThinkingLevelMap(efforts) } : {}),
		input: input.length > 0 ? input : ["text"],
		cost: {
			input: parsePrice(router.pricing.input),
			output: parsePrice(router.pricing.output),
			cacheRead: parsePrice(router.pricing.cache_read_input),
			cacheWrite,
		},
		contextWindow: router.limits.context_window,
		maxTokens: router.limits.max_output_tokens,
	};
}

/** Fetches the caller's callable model catalog from Router and maps it into pi's Model shape. */
export async function fetchRampRouterModels(apiKey: string, signal: AbortSignal): Promise<Model<"openai-responses">[]> {
	const response = await fetch(`${RAMP_ROUTER_BASE_URL}/models`, {
		headers: { Authorization: `Bearer ${apiKey}` },
		signal,
	});
	if (!response.ok) throw new Error(`Ramp Router API returned ${response.status}`);

	const payload = (await response.json()) as RampRouterModelsResponse;
	return payload.data.filter(isSelectableRampRouterModel).map(toRampRouterModel);
}
