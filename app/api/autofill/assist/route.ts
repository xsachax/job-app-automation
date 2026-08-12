import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  assistAutofill,
  AutofillAssistProviderError,
  AutofillAssistValidationError,
} from "@/lib/autofill/assist";
import {
  CHROME_AUTOFILL_EXTENSION_ID,
  CHROME_AUTOFILL_EXTENSION_ORIGIN,
} from "@/lib/chrome-extension-constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedHeaders = "Content-Type, X-Job-Autofill-Extension";

function corsHeaders(request: NextRequest): Record<string, string> {
  return request.headers.get("origin") === CHROME_AUTOFILL_EXTENSION_ORIGIN
    ? {
        "Access-Control-Allow-Headers": allowedHeaders,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Origin": CHROME_AUTOFILL_EXTENSION_ORIGIN,
        "Cache-Control": "no-store",
        Vary: "Origin",
      }
    : { "Cache-Control": "no-store", Vary: "Origin" };
}

function response(
  request: NextRequest,
  body: unknown,
  status = 200,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: corsHeaders(request),
  });
}

function isTrustedExtensionRequest(request: NextRequest): boolean {
  return (
    ["localhost", "127.0.0.1"].includes(request.nextUrl.hostname) &&
    request.headers.get("origin") === CHROME_AUTOFILL_EXTENSION_ORIGIN &&
    request.headers.get("x-job-autofill-extension") ===
      CHROME_AUTOFILL_EXTENSION_ID
  );
}

export function OPTIONS(request: NextRequest) {
  if (
    !["localhost", "127.0.0.1"].includes(request.nextUrl.hostname) ||
    request.headers.get("origin") !== CHROME_AUTOFILL_EXTENSION_ORIGIN
  ) {
    return response(request, { error: "extension origin required" }, 403);
  }
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export async function POST(request: NextRequest) {
  if (!isTrustedExtensionRequest(request)) {
    return response(request, { error: "trusted extension request required" }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response(request, { error: "invalid JSON body" }, 400);
  }

  try {
    return response(request, await assistAutofill(body));
  } catch (error) {
    if (error instanceof AutofillAssistValidationError) {
      return response(request, { error: error.message }, 400);
    }
    if (error instanceof AutofillAssistProviderError) {
      return response(request, { error: error.message }, 502);
    }
    return response(request, { error: "Assisted autofill failed." }, 500);
  }
}
