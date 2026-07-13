export async function GET() {
  return Response.json(
    {
      status: "ok",
      service: "bid-shield",
      version: "1.0.0",
      dataMode: process.env.KONEPS_SERVICE_KEY ? "connected" : "demo",
      timestamp: new Date().toISOString(),
    },
    { headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
}
