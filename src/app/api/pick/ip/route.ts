import { NextResponse } from "next/server";
import { networkInterfaces } from "os";

export async function GET() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      // Skip internal and non-IPv4 addresses
      if (!net.internal && net.family === "IPv4") {
        return NextResponse.json({ ip: net.address });
      }
    }
  }
  return NextResponse.json({ ip: null });
}
