import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../lib/db";
import {
  getExternalJudgeProviderConfig,
  getJudgeProviderPublicSettings,
  getSelectedExternalJudgeProviderConfig,
} from "../lib/judge/provider-settings";
import {
  GET,
  PUT,
} from "../app/api/settings/judge-provider/route";

function putRequest(
  body: unknown,
  origin = "http://localhost:3000",
): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/settings/judge-provider",
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        host: "localhost:3000",
        origin,
      },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(async () => {
  delete process.env.COPILOT_JUDGE_CONNECTED;
  await prisma.judgeProviderSettings.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Judge provider settings API", () => {
  it("returns only masked provider state and never returns the saved secret", async () => {
    const secret = "sk-openai-private-1234";
    const saved = await PUT(
      putRequest({
        provider: "openai",
        model: "gpt-safe-model",
        apiKey: secret,
      }),
    );
    expect(saved.status).toBe(200);
    const savedBody = await saved.json();
    expect(savedBody).toMatchObject({
      provider: "openai",
      model: "gpt-safe-model",
      hasApiKey: true,
      apiKeyHint: "****1234",
      effectiveProvider: "openai",
    });
    expect(JSON.stringify(savedBody)).not.toContain(secret);

    const response = await GET();
    const body = await response.json();
    expect(body.apiKeyHint).toBe("****1234");
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(await getExternalJudgeProviderConfig("openai")).toMatchObject({
      apiKey: secret,
    });
  });

  it("distinguishes preserve, replace, clear, and provider switching", async () => {
    await PUT(
      putRequest({
        provider: "openai",
        model: "gpt-one",
        apiKey: "sk-openai-first-1111",
      }),
    );

    await PUT(
      putRequest({
        provider: "openai",
        model: "gpt-two",
      }),
    );
    expect(await getExternalJudgeProviderConfig("openai")).toMatchObject({
      model: "gpt-two",
      apiKey: "sk-openai-first-1111",
    });

    await PUT(
      putRequest({
        provider: "openai",
        apiKey: "sk-openai-second-2222",
      }),
    );
    expect(await getExternalJudgeProviderConfig("openai")).toMatchObject({
      apiKey: "sk-openai-second-2222",
    });

    await PUT(
      putRequest({
        provider: "anthropic",
        model: "claude-safe",
        apiKey: "sk-ant-private-3333",
      }),
    );
    expect(await getExternalJudgeProviderConfig("openai")).toMatchObject({
      apiKey: "sk-openai-second-2222",
    });
    expect(await getExternalJudgeProviderConfig("anthropic")).toMatchObject({
      apiKey: "sk-ant-private-3333",
    });
    expect(await getSelectedExternalJudgeProviderConfig()).toMatchObject({
      provider: "anthropic",
      apiKey: "sk-ant-private-3333",
    });

    await PUT(putRequest({ provider: "openai", apiKey: null }));
    expect(await getExternalJudgeProviderConfig("openai")).toBeNull();
    expect(await getExternalJudgeProviderConfig("anthropic")).toMatchObject({
      apiKey: "sk-ant-private-3333",
    });
  });

  it("atomically preserves both provider secrets during concurrent saves", async () => {
    await Promise.all([
      PUT(
        putRequest({
          provider: "openai",
          apiKey: "sk-openai-concurrent-1111",
        }),
      ),
      PUT(
        putRequest({
          provider: "anthropic",
          apiKey: "sk-ant-concurrent-2222",
        }),
      ),
    ]);

    expect(await getExternalJudgeProviderConfig("openai")).toMatchObject({
      apiKey: "sk-openai-concurrent-1111",
    });
    expect(await getExternalJudgeProviderConfig("anthropic")).toMatchObject({
      apiKey: "sk-ant-concurrent-2222",
    });
  });

  it("rejects masked placeholders instead of storing them as credentials", async () => {
    const response = await PUT(
      putRequest({
        provider: "openai",
        apiKey: "****1234",
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "API key must be an unmasked 8-512 character secret without whitespace.",
    });
    expect(await getExternalJudgeProviderConfig("openai")).toBeNull();
  });

  it("requires same-origin mutation requests", async () => {
    const response = await PUT(
      putRequest(
        {
          provider: "openai",
          apiKey: "sk-openai-private-1234",
        },
        "https://attacker.example",
      ),
    );
    expect(response.status).toBe(403);
    expect(await getExternalJudgeProviderConfig("openai")).toBeNull();
  });

  it("treats only the exact value 1 as the truthful Copilot connection signal", async () => {
    process.env.COPILOT_JUDGE_CONNECTED = "true";
    expect((await getJudgeProviderPublicSettings()).copilotConnected).toBe(
      false,
    );

    process.env.COPILOT_JUDGE_CONNECTED = "1";
    const settings = await getJudgeProviderPublicSettings();
    expect(settings).toMatchObject({
      copilotConnected: true,
      copilotHasPriority: true,
      effectiveProvider: "copilot",
    });
  });
});
