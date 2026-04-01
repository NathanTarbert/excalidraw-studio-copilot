import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Storage abstraction — Redis on Vercel, in-memory locally
// ---------------------------------------------------------------------------

interface PickEntry {
  prompt: string;
  status: "scanned" | "picked";
}

// In-memory fallback (works in local dev)
const memStore = new Map<string, PickEntry>();

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  // Lazy-import so the module doesn't break without the env vars
  const { Redis } = require("@upstash/redis") as typeof import("@upstash/redis");
  return new Redis({ url, token });
}

const PICK_TTL = 60 * 10; // 10 minutes

function key(sessionId: string) {
  return `pick:${sessionId}`;
}

async function getEntry(sessionId: string): Promise<PickEntry | null> {
  const redis = getRedis();
  if (redis) {
    return redis.get<PickEntry>(key(sessionId));
  }
  return memStore.get(sessionId) ?? null;
}

async function setEntry(sessionId: string, entry: PickEntry) {
  const redis = getRedis();
  if (redis) {
    await redis.set(key(sessionId), entry, { ex: PICK_TTL });
  } else {
    memStore.set(sessionId, entry);
  }
}

async function deleteEntry(sessionId: string) {
  const redis = getRedis();
  if (redis) {
    await redis.del(key(sessionId));
  } else {
    memStore.delete(sessionId);
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/** PUT – register that someone opened the pick page (scanned the QR) */
export async function PUT(req: NextRequest) {
  const { sessionId } = await req.json();
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }
  const existing = await getEntry(sessionId);
  if (!existing) {
    await setEntry(sessionId, { prompt: "", status: "scanned" });
  }
  return NextResponse.json({ ok: true });
}

/** POST – submit a pick (from mobile form) */
export async function POST(req: NextRequest) {
  const { sessionId, prompt } = await req.json();
  if (!sessionId || !prompt) {
    return NextResponse.json({ error: "Missing sessionId or prompt" }, { status: 400 });
  }
  await setEntry(sessionId, { prompt, status: "picked" });
  return NextResponse.json({ ok: true });
}

/** GET – poll for status (from main app) */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }
  const entry = await getEntry(sessionId);
  if (!entry) {
    return NextResponse.json({ status: "waiting" });
  }
  if (entry.status === "scanned") {
    return NextResponse.json({ status: "scanned" });
  }
  // Consume the pick so it only fires once
  await deleteEntry(sessionId);
  return NextResponse.json({ status: "picked", prompt: entry.prompt });
}
