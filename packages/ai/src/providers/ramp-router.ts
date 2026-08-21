import { openAIResponsesApi } from "../api/openai-responses.lazy.ts";
import { envApiKeyAuth } from "../auth/helpers.ts";
import { createProvider, type Provider, type RefreshModelsContext } from "../models.ts";
import type { Model } from "../types.ts";
import { fetchRampRouterModels, RAMP_ROUTER_BASE_URL } from "./ramp-router-config.ts";

async function fetchModels(context: RefreshModelsContext): Promise<Model<"openai-responses">[]> {
	const apiKey = context.credential?.type === "api_key" ? context.credential.key : undefined;
	if (!apiKey) throw new Error("Ramp Router: missing API key credential");
	return fetchRampRouterModels(apiKey, context.signal);
}

export function rampRouterProvider(): Provider<"openai-responses"> {
	return createProvider({
		id: "ramp-router",
		name: "Ramp Router",
		baseUrl: RAMP_ROUTER_BASE_URL,
		auth: { apiKey: envApiKeyAuth("Ramp Router API key", ["RAMP_ROUTER_API_KEY"]) },
		models: [],
		fetchModels,
		api: openAIResponsesApi(),
	});
}
