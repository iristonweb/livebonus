export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    service: "all-in-guide-site",
    ts: new Date().toISOString(),
  });
}
