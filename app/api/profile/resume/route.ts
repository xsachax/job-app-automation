import { prisma } from "@/lib/db";

export async function GET() {
  const asset = await prisma.resumeAsset.findUnique({ where: { id: "me" } });
  if (!asset) {
    return Response.json({ error: "No saved resume PDF." }, { status: 404 });
  }

  const fileName = asset.fileName.replace(/[^A-Za-z0-9._-]+/g, "-");
  return new Response(new Uint8Array(asset.data), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(asset.data.byteLength),
      "Content-Type": asset.mimeType,
      "X-Content-Type-Options": "nosniff",
      "X-Resume-Filename": fileName,
    },
  });
}
