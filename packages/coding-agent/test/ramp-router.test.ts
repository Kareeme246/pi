import { InMemoryModelsStore } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { ModelRuntime } from "../src/core/model-runtime.ts";
import { allowNetwork } from "./test-network-env.ts";

const RAMP_ROUTER_PROVIDER_ID = "ramp-router";
const MODELS_URL = "https://api.router.com/v1/models";

function rampRouterModelsResponse() {
	return {
		data: [
			{
				id: "claude-sonnet-5",
				router: {
					status: "active",
					display_name: "Claude Sonnet 5",
					limits: { context_window: 1000000, max_output_tokens: 128000 },
					capabilities: {
						modalities: { input: ["image", "text"] },
						tools: { supported: true },
						reasoning: { supported: true, efforts: [{ value: "none" }, { value: "high" }] },
					},
					pricing: {
						input: "2",
						output: "10",
						cache_read_input: "0.2",
						cache_write_input: "0",
						cache_write_input_5m: "2.5",
					},
				},
			},
			// Excluded: deprecated status.
			{
				id: "gpt-4",
				router: {
					status: "deprecated",
					display_name: "GPT-4",
					limits: { context_window: 8192, max_output_tokens: 8192 },
					capabilities: {
						modalities: { input: ["text"] },
						tools: { supported: true },
						reasoning: { supported: false, efforts: [] },
					},
					pricing: {
						input: "30",
						output: "60",
						cache_read_input: "0",
						cache_write_input: "0",
						cache_write_input_5m: "0",
					},
				},
			},
			// Excluded: no tool support.
			{
				id: "accounts/fireworks/models/gpt-oss-20b",
				router: {
					status: "active",
					display_name: "OpenAI gpt-oss-20b",
					limits: { context_window: 131072, max_output_tokens: 131072 },
					capabilities: {
						modalities: { input: ["text"] },
						tools: { supported: false },
						reasoning: { supported: true, efforts: [{ value: "none" }] },
					},
					pricing: {
						input: "0.07",
						output: "0.3",
						cache_read_input: "0",
						cache_write_input: "0",
						cache_write_input_5m: "0",
					},
				},
			},
		],
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Ramp Router provider", () => {
	it("fetches, filters, and stores the catalog for a configured API key", async () => {
		allowNetwork();
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify(rampRouterModelsResponse()), { status: 200 }));
		const modelsStore = new InMemoryModelsStore();
		const runtime = await ModelRuntime.create({
			credentials: AuthStorage.inMemory({ [RAMP_ROUTER_PROVIDER_ID]: { type: "api_key", key: "test-key" } }),
			modelsStore,
			modelsPath: null,
			allowModelNetwork: true,
		});

		const model = runtime.getModel(RAMP_ROUTER_PROVIDER_ID, "claude-sonnet-5");
		expect(model).toMatchObject({ api: "openai-responses", provider: RAMP_ROUTER_PROVIDER_ID, reasoning: true });

		// Deprecated and non-tool-capable entries are filtered out end to end.
		expect(runtime.getModels(RAMP_ROUTER_PROVIDER_ID)).toHaveLength(1);
		expect(runtime.getModel(RAMP_ROUTER_PROVIDER_ID, "gpt-4")).toBeUndefined();
		expect(runtime.getModel(RAMP_ROUTER_PROVIDER_ID, "accounts/fireworks/models/gpt-oss-20b")).toBeUndefined();

		expect((await modelsStore.read(RAMP_ROUTER_PROVIDER_ID))?.models).toHaveLength(1);
		const rampRouterRequest = fetchSpy.mock.calls.find(([url]) => String(url) === MODELS_URL);
		expect(rampRouterRequest?.[1]?.headers).toMatchObject({ Authorization: "Bearer test-key" });
	});

	it("does not refresh catalogs over the network by default", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected catalog fetch"));
		const runtime = await ModelRuntime.create({
			credentials: AuthStorage.inMemory({ [RAMP_ROUTER_PROVIDER_ID]: { type: "api_key", key: "test-key" } }),
			modelsStore: new InMemoryModelsStore(),
			modelsPath: null,
		});

		expect(runtime.getModels(RAMP_ROUTER_PROVIDER_ID)).toEqual([]);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("does not fetch or expose Ramp Router models without configured auth", async () => {
		allowNetwork();
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const runtime = await ModelRuntime.create({
			credentials: AuthStorage.inMemory(),
			modelsStore: new InMemoryModelsStore(),
			modelsPath: null,
			allowModelNetwork: true,
		});

		expect(runtime.getModels(RAMP_ROUTER_PROVIDER_ID)).toEqual([]);
		expect(fetchSpy.mock.calls.some(([url]) => String(url) === MODELS_URL)).toBe(false);
	});

	it("surfaces Router API errors instead of silently succeeding", async () => {
		allowNetwork();
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unauthorized", { status: 401 }));
		const runtime = await ModelRuntime.create({
			credentials: AuthStorage.inMemory({ [RAMP_ROUTER_PROVIDER_ID]: { type: "api_key", key: "bad-key" } }),
			modelsStore: new InMemoryModelsStore(),
			modelsPath: null,
			allowModelNetwork: true,
		});

		expect(runtime.getModels(RAMP_ROUTER_PROVIDER_ID)).toEqual([]);
	});

	it("restores a previously persisted catalog without refetching when network is disallowed", async () => {
		const modelsStore = new InMemoryModelsStore();
		await modelsStore.write(RAMP_ROUTER_PROVIDER_ID, {
			checkedAt: Date.now(),
			models: [
				{
					id: "claude-sonnet-5",
					name: "Claude Sonnet 5",
					api: "openai-responses",
					provider: RAMP_ROUTER_PROVIDER_ID,
					baseUrl: "https://api.router.com/v1",
					reasoning: true,
					input: ["image", "text"],
					cost: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
					contextWindow: 1000000,
					maxTokens: 128000,
				},
			],
		});
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected catalog fetch"));
		const runtime = await ModelRuntime.create({
			credentials: AuthStorage.inMemory({ [RAMP_ROUTER_PROVIDER_ID]: { type: "api_key", key: "test-key" } }),
			modelsStore,
			modelsPath: null,
			allowModelNetwork: false,
		});

		expect(runtime.getModel(RAMP_ROUTER_PROVIDER_ID, "claude-sonnet-5")).toBeDefined();
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
