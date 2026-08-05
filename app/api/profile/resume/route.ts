import { prisma } from "@/lib/db";

async function getResumeAsset() {
  return prisma.resumeAsset.findUnique({ where: { id: "me" } });
}

function assetHeaders(
  asset: NonNullable<Awaited<ReturnType<typeof getResumeAsset>>>,
  disposition: "attachment" | "inline",
) {
  const fileName = asset.fileName.replace(/[^A-Za-z0-9._-]+/g, "-");
  return {
    "Cache-Control": "no-store",
    "Content-Disposition": `${disposition}; filename="${fileName}"`,
    "Content-Length": String(asset.data.byteLength),
    "Content-Type": asset.mimeType,
    "Last-Modified": asset.updatedAt.toUTCString(),
    "X-Content-Type-Options": "nosniff",
    "X-Resume-Filename": fileName,
    "X-Resume-Size": String(asset.data.byteLength),
    "X-Resume-Source": encodeURIComponent(asset.source),
    "X-Resume-Updated-At": asset.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const asset = await getResumeAsset();
  if (!asset) {
    return Response.json({ error: "No saved resume PDF." }, { status: 404 });
  }

  const preview = new URL(request.url).searchParams.get("preview") === "1";
  return new Response(new Uint8Array(asset.data), {
    headers: assetHeaders(asset, preview ? "inline" : "attachment"),
  });
}

export async function HEAD() {
  const asset = await getResumeAsset();
  if (!asset) {
    return new Response(null, { status: 404 });
  }
  return new Response(null, {
    headers: assetHeaders(asset, "attachment"),
  });
}
