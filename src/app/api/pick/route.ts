import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Storage abstraction — Vercel KV in production, in-memory locally
// ---------------------------------------------------------------------------

interface PickEntry {
  prompt: string;
  status: "scanned" | "picked";
}

// In-memory fallback (works in local dev)
const memStore = new Map<string, PickEntry>();

function getKv() {
  // Vercel KV auto-injects KV_REST_API_URL + KV_REST_API_TOKEN
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  const { kv } = require("@vercel/kv") as typeof import("@vercel/kv");
  return kv;
}

const PICK_TTL = 60 * 10; // 10 minutes

function key(sessionId: string) {
  return `pick:${sessionId}`;
}

async function getEntry(sessionId: string): Promise<PickEntry | null> {
  const kv = getKv();
  if (kv) {
    return kv.get<PickEntry>(key(sessionId));
  }
  return memStore.get(sessionId) ?? null;
}

async function setEntry(sessionId: string, entry: PickEntry) {
  const kv = getKv();
  if (kv) {
    await kv.set(key(sessionId), entry, { ex: PICK_TTL });
  } else {
    memStore.set(sessionId, entry);
  }
}

async function deleteEntry(sessionId: string) {
  const kv = getKv();
  if (kv) {
    await kv.del(key(sessionId));
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
