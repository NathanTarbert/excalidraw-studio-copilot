"use client";

import {
  CopilotChat,
  useAgentContext,
  useFrontendTool,
  useAgent,
  UseAgentUpdate,
  useCopilotKit,
} from "@copilotkit/react-core/v2";
import { z } from "zod";
import Link from "next/link";
import { useEffect, useRef, useState, Suspense } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { McpWidgetZoom } from "@/components/mcp-widget-zoom";
import { SKILLS, DEFAULT_SKILL_ID } from "@/skills";

const CARDS = [
  {
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    title: "Just describe it",
    desc: "Plain English → diagram in seconds, no design tools needed",
  },
  {
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      >
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
    title: "Edit and iterate",
    desc: "Opens as a local workspace - draw more yourself, then bring it back to chat",
  },
  {
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      >
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    title: "Saved workspaces",
    desc: "All diagrams are stored and ready to revisit or share anytime",
  },
];

const SUGGESTIONS = [
  "Show me how git branch works",
];

const EDIT_SUGGESTIONS = [
  "Add a database layer",
  "Simplify the layout",
  "Add color coding by type",
];

const PORTAL_ID = "excalidraw-welcome-portal";

const TOOL_LABELS: Record<string, string> = {
  read_me: "Reading diagram guide…",
  draw_element: "Drawing elements…",
  create_view: "Rendering diagram…",
};

const SPINNER_HTML =
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6965db" stroke-width="2.5" stroke-linecap="round" style="animation:cpk-spin 0.7s linear infinite;flex-shrink:0"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

function setSlotContent(slot: HTMLElement, label: string | null) {
  slot.innerHTML = label
    ? `<span style="display:inline-flex;align-items:center;gap:6px;margin-left:2px;">${SPINNER_HTML}<span style="color:#6965db;font-size:15px;">${label}</span></span>`
    : "";
}

function InlineAgentStatus() {
  const { agent } = useAgent({
    updates: [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const isRunning = (agent as any).isRunning as boolean;
  const msgs: any[] = (agent as any).messages ?? [];
  const lastAssistant = [...msgs].reverse().find((m: any) => m.role === "assistant");
  const toolName = lastAssistant?.toolCalls?.[0]?.function?.name as string | undefined;
  const label = isRunning ? ((toolName && TOOL_LABELS[toolName]) ?? "Thinking…") : null;

  const slotRef = useRef<HTMLElement | null>(null);
  const labelRef = useRef(label);
  labelRef.current = label;

  useEffect(() => {
    if (slotRef.current) setSlotContent(slotRef.current, label);
  }, [label]);

  useEffect(() => {
    const sync = () => {
      const cursor = document.querySelector('[data-testid="copilot-loading-cursor"]');
      const slotInDom = slotRef.current && document.body.contains(slotRef.current);
      if (cursor) {
        if (!slotInDom) {
          if (slotRef.current) slotRef.current.remove();
          const slot = document.createElement("span");
          cursor.parentNode?.insertBefore(slot, cursor);
          slotRef.current = slot;
          setSlotContent(slot, labelRef.current);
        }
      } else {
        if (slotRef.current) {
          slotRef.current.remove();
          slotRef.current = null;
        }
      }
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}

function DiagramSession({
  urlCheckpointId,
  sessionCheckpointId,
  onSessionUpdate,
  sendPromptRef,
}: {
  urlCheckpointId: string | undefined;
  sessionCheckpointId: string | undefined;
  onSessionUpdate: (id: string) => void;
  sendPromptRef?: React.MutableRefObject<((prompt: string) => Promise<void>) | null>;
}) {
  const [currentElements, setCurrentElements] = useState<any[]>([]);
  const activeId = sessionCheckpointId ?? urlCheckpointId;
  const { agent } = useAgent();
  const { copilotkit } = useCopilotKit();
  const hasAutoShown = useRef(false);
  // Stable refs so auto-show effect doesn't re-fire on agent/copilotkit reference churn
  const agentRef = useRef(agent);
  const copilotKitRef = useRef(copilotkit);
  agentRef.current = agent;
  copilotKitRef.current = copilotkit;

  // Expose a way for parent to programmatically send a prompt to the agent
  useEffect(() => {
    if (sendPromptRef) {
      sendPromptRef.current = async (prompt: string) => {
        agentRef.current.addMessage({
          id: crypto.randomUUID(),
          role: "user",
          content: prompt,
        });
        await copilotKitRef.current.runAgent({ agent: agentRef.current });
      };
    }
    return () => {
      if (sendPromptRef) sendPromptRef.current = null;
    };
  }, [sendPromptRef]);

  // Use a sentinel so the effect always fires on mount when urlCheckpointId is defined
  const prevCheckpointRef = useRef<string | undefined>("__unset__");

  // Clear session when urlCheckpointId changes (including on initial mount with a checkpoint)
  useEffect(() => {
    if (urlCheckpointId !== prevCheckpointRef.current) {
      prevCheckpointRef.current = urlCheckpointId;
      hasAutoShown.current = false;
      // Clear agent messages so old conversation doesn't bleed into new workspace
      try {
        agent.setMessages([]);
      } catch {
        // agent may not be ready yet
      }
    }
  }, [urlCheckpointId, agent]);

  // Keep currentElements in sync with the active workspace
  useEffect(() => {
    if (!activeId) {
      setCurrentElements([]);
      return;
    }
    // Abort controller cancels in-flight fetch if activeId changes before response
    let controller = new AbortController();
    const fetchElements = () => {
      controller.abort();
      controller = new AbortController();
      fetch(`/api/checkpoint/${activeId}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((d) => setCurrentElements(d.elements ?? []))
        .catch(() => {});
    };
    fetchElements();
    // Re-fetch when user returns from workspace tab
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchElements();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activeId]);

  // Auto-show: when entering edit mode, trigger the agent to render the current diagram.
  // Uses refs for agent/copilotkit so this effect only re-runs when the data it cares about
  // changes (urlCheckpointId / currentElements), not on every reference churn render.
  useEffect(() => {
    if (!urlCheckpointId || currentElements.length === 0 || hasAutoShown.current) return;
    hasAutoShown.current = true;
    const autoShow = async () => {
      // Small delay to let useAgentContext register elements
      await new Promise((r) => setTimeout(r, 300));
      agentRef.current.addMessage({
        id: crypto.randomUUID(),
        role: "user",
        content: "Show current diagram",
      });
      try {
        await copilotKitRef.current.runAgent({ agent: agentRef.current });
      } catch (err) {
        console.error("[auto-show] runAgent failed", err);
      }
    };
    autoShow();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCheckpointId, currentElements]);

  useAgentContext({
    description: activeId
      ? `ACTIVE DIAGRAM SESSION — workspace id: "${activeId}". The current elements are in the value below. Rules: (1) If the user message is "Show current diagram" or similar short display requests, immediately call create_view with the currentElements array exactly as-is — no changes, no commentary before calling it. (2) For edits, generate the COMPLETE final elements array in create_view. Do NOT use restoreCheckpoint. (3) After every create_view, ALWAYS call update_session_workspace with the new checkpointId.`
      : `After every create_view call, always call update_session_workspace with the checkpointId from the response to register it as the active workspace for this session.`,
    value: activeId
      ? JSON.parse(
          JSON.stringify({
            sessionCheckpointId: activeId,
            currentElements:
              currentElements.length > 0 ? currentElements : null,
          }),
        )
      : {},
  });

  useFrontendTool(
    {
      name: "update_session_workspace",
      description:
        "Call this after EVERY create_view. Registers the diagram as the active session workspace and replaces its elements with the latest version.",
      parameters: z.object({
        newCheckpointId: z
          .string()
          .describe("The checkpointId returned by create_view"),
      }),
      handler: async ({ newCheckpointId }) => {
        try {
          const targetId = sessionCheckpointId ?? urlCheckpointId ?? null;
          const newData = await fetch(
            `/api/checkpoint/${newCheckpointId}`,
          ).then((r) => r.json());

          if (!targetId) {
            // Fresh chat, first diagram — use the new checkpoint as-is
            setCurrentElements(newData.elements ?? []);
            onSessionUpdate(newCheckpointId);
            return `Workspace ${newCheckpointId} is now the active diagram. For future edits, update this workspace.`;
          }

          if (newCheckpointId === targetId) {
            setCurrentElements(newData.elements ?? []);
            return `Workspace ${targetId} is already the session workspace.`;
          }

          // Replace target workspace elements, then hard-delete the temp
          await fetch(`/api/checkpoint/${targetId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ elements: newData.elements }),
          });
          await fetch(`/api/checkpoint/${newCheckpointId}?hard=true`, {
            method: "DELETE",
          });
          setCurrentElements(newData.elements ?? []);
          onSessionUpdate(targetId);
          return `Workspace ${targetId} updated with the latest diagram.`;
        } catch (e) {
          console.error("[update_session_workspace] error", e);
          return `Error: ${String(e)}`;
        }
      },
    },
    [sessionCheckpointId, urlCheckpointId, onSessionUpdate],
  );

  return null;
}

function SettingsPanel({
  isOpen,
  onClose,
  selectedSkillId,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  selectedSkillId: string;
  onSelect: (id: string) => void;
}) {
  if (!isOpen) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-[360px] bg-white shadow-2xl z-50 flex flex-col border-l border-gray-100">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <span className="font-semibold text-gray-800 text-sm">Settings</span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-[11px] font-medium text-gray-400 tracking-wider uppercase mb-3">Diagram Style</p>
          <div className="grid grid-cols-2 gap-2">
            {SKILLS.map(skill => (
              <button
                key={skill.id}
                onClick={() => { onSelect(skill.id); onClose(); }}
                className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedSkillId === skill.id
                    ? "border-[#6965db] bg-[#6965db]/5 ring-1 ring-[#6965db]/30"
                    : "border-gray-100 hover:border-[#6965db]/30 hover:bg-gray-50"
                }`}
              >
                <p className={`text-sm font-semibold leading-snug ${selectedSkillId === skill.id ? "text-[#6965db]" : "text-gray-800"}`}>
                  {skill.name}
                </p>
                <p className="text-xs text-gray-400 leading-snug mt-0.5">{skill.tagline}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function CheckpointBanner({ checkpointId }: { checkpointId: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 bg-[#6965db]/8 border border-[#6965db]/20 rounded-lg text-sm text-[#6965db] mx-6 mt-3 shrink-0">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
      <span className="flex-1 min-w-0 truncate">
        Editing{" "}
        <span className="font-mono font-medium">
          {checkpointId.slice(0, 8)}
        </span>{" "}
        · loading your diagram
      </span>
      <Link
        href={`/workspace/${checkpointId}`}
        target="_blank"
        className="text-[11px] text-[#6965db]/70 hover:text-[#6965db] transition-colors px-2 py-0.5 rounded border border-[#6965db]/20 hover:border-[#6965db]/40 shrink-0"
      >
        Open workspace
      </Link>
      <button
        onClick={() => router.replace("/")}
        className="text-[#6965db]/50 hover:text-[#6965db] transition-colors cursor-pointer shrink-0"
        aria-label="Dismiss"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function WelcomePortal({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    function tryAttach() {
      const welcome = document.querySelector(
        '[data-testid="copilot-welcome-screen"]',
      );
      if (!welcome) return;
      let portal = document.getElementById(PORTAL_ID);
      if (!portal) {
        portal = document.createElement("div");
        portal.id = PORTAL_ID;
        welcome.appendChild(portal);
      }
      setTarget(portal);
    }

    tryAttach();

    const observer = new MutationObserver(() => {
      const welcome = document.querySelector(
        '[data-testid="copilot-welcome-screen"]',
      );
      if (!welcome) {
        document.getElementById(PORTAL_ID)?.remove();
        setTarget(null);
      } else if (!document.getElementById(PORTAL_ID)) {
        tryAttach();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!target) return null;
  return createPortal(children, target);
}

function usePickUrl(sessionId: string) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const origin = window.location.origin;
    // If running on localhost, try to resolve the LAN IP so phones can connect
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    ) {
      fetch("/api/pick/ip")
        .then((r) => r.json())
        .then((data) => {
          if (data.ip) {
            setUrl(`http://${data.ip}:${window.location.port}/pick?session=${sessionId}`);
          } else {
            setUrl(`${origin}/pick?session=${sessionId}`);
          }
        })
        .catch(() => setUrl(`${origin}/pick?session=${sessionId}`));
    } else {
      setUrl(`${origin}/pick?session=${sessionId}`);
    }
  }, [sessionId]);
  return url;
}

function QrModal({
  isOpen,
  onClose,
  sessionId,
  scanStatus,
}: {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  scanStatus: "waiting" | "scanned" | "picked";
}) {
  const pickUrl = usePickUrl(sessionId);
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 flex flex-col items-center gap-5 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-gray-900">Scan to Pick a Design</h2>
            <p className="text-sm text-gray-500 mt-1">
              Scan this QR code with your phone to choose an architecture pattern
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            {pickUrl ? (
              <QRCodeSVG value={pickUrl} size={200} level="M" />
            ) : (
              <div className="w-[200px] h-[200px] flex items-center justify-center text-gray-300 text-sm">
                Loading...
              </div>
            )}
          </div>
          <div className="h-6 flex items-center">
            {scanStatus === "waiting" && (
              <p className="text-sm text-gray-400">Scan the QR code with your phone</p>
            )}
            {scanStatus === "scanned" && (
              <div className="flex items-center gap-2 text-[#6965db]">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="animate-spin"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <p className="text-sm">Someone&apos;s choosing a design...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const urlCheckpointId = searchParams.get("checkpoint") ?? undefined;
  const [sessionCheckpointId, setSessionCheckpointId] = useState<
    string | undefined
  >(urlCheckpointId);

  const sendPromptRef = useRef<((prompt: string) => Promise<void>) | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrSessionId] = useState(() => crypto.randomUUID().slice(0, 12));
  const [scanStatus, setScanStatus] = useState<"waiting" | "scanned" | "picked">("waiting");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("diagram-skill");
      return SKILLS.some(s => s.id === stored) ? stored! : DEFAULT_SKILL_ID;
    }
    return DEFAULT_SKILL_ID;
  });

  useEffect(() => {
    localStorage.setItem("diagram-skill", selectedSkillId);
  }, [selectedSkillId]);

  const selectedSkill = SKILLS.find(s => s.id === selectedSkillId) ?? SKILLS[0];
  useAgentContext({
    description: `DIAGRAM STYLE GUIDE — ${selectedSkill.name}: ${selectedSkill.tagline}`,
    value: selectedSkill.prompt,
  });

  // Reset session when the URL checkpoint changes
  useEffect(() => {
    setSessionCheckpointId(urlCheckpointId);
  }, [urlCheckpointId]);

  // Reset scan status when modal opens
  useEffect(() => {
    if (qrOpen) setScanStatus("waiting");
  }, [qrOpen]);

  // Poll for QR pick submissions
  useEffect(() => {
    if (!qrOpen) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pick?sessionId=${qrSessionId}`);
        const data = await res.json();
        if (data.status === "scanned") {
          setScanStatus("scanned");
        } else if (data.status === "picked" && data.prompt) {
          setScanStatus("picked");
          setQrOpen(false);
          // Send the prompt directly to the CopilotKit agent
          if (sendPromptRef.current) {
            sendPromptRef.current(data.prompt).catch((err) =>
              console.error("[qr-pick] runAgent failed", err)
            );
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [qrOpen, qrSessionId]);

  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      if (e.data?.type === "excalidraw-workspace" && e.data?.checkpointId) {
        // Open the session workspace instead of the temp checkpoint
        const targetId =
          sessionCheckpointId ?? urlCheckpointId ?? e.data.checkpointId;
        window.open(`/workspace/${targetId}`, "_blank");
      }

      if (e.data?.type === "excalidraw-diagram-ready" && e.data?.checkpointId) {
        const newCheckpointId: string = e.data.checkpointId;
        const targetId = sessionCheckpointId ?? urlCheckpointId ?? null;

        if (!targetId) {
          // new checkpoint becomes the session
          setSessionCheckpointId(newCheckpointId);
          return;
        }
        if (newCheckpointId === targetId) return;

        // Replace target workspace with the new elements, hard-delete temp
        try {
          const newData = await fetch(
            `/api/checkpoint/${newCheckpointId}`,
          ).then((r) => r.json());
          await fetch(`/api/checkpoint/${targetId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ elements: newData.elements }),
          });
          await fetch(`/api/checkpoint/${newCheckpointId}?hard=true`, {
            method: "DELETE",
          });
        } catch (err) {
          console.error("[diagram-ready] error", err);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [sessionCheckpointId, urlCheckpointId]);

  return (
    <>
      <McpWidgetZoom />
      <DiagramSession
        urlCheckpointId={urlCheckpointId}
        sessionCheckpointId={sessionCheckpointId}
        onSessionUpdate={setSessionCheckpointId}
        sendPromptRef={sendPromptRef}
      />
      <main className="h-screen w-screen flex flex-col bg-white">
        <nav className="flex items-center justify-between px-6 py-3 border-b border-gray-100 shrink-0">
          <Link
            href="/"
            className="flex items-center gap-2 select-none cursor-pointer"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#6965DB">
              <path d="M23.9428 19.8058a.1962.1962 0 0 0-.1679-.0337c-1.26-1.8552-2.8727-3.6104-4.4186-5.3152l-.2521-.284c-.0016-.0732-.0667-.1207-.1342-.1504-.0284-.0277-.0562-.0558-.0843-.0837-.0505-.1005-.1685-.1673-.2858-.1005-.4706.2347-.9068.5855-1.3274.9195-.5536.4345-1.1085.8695-1.6296 1.354a5.0577 5.0577 0 0 0-.5879.6185c-.0842.1168-.0168.2172.0843.2672-.3701.3677-.7402.736-1.109 1.1198a.1896.1896 0 0 0-.0506.1342c0 .05.0337.1.0668.1168l.6559.5012v.0169c.9237.9194 2.5538 2.1729 4.2844 3.5268.2515.201.5205.4014.7727.6017.1173.1342.2346.2847.3357.4182.0506.0662.1685.0837.2353.0331.0337.0337.0843.0668.118.1005a.2395.2395 0 0 0 .1004.0337.1534.1534 0 0 0 .1348-.0668.2371.2371 0 0 0 .0331-.1004c.0175 0 .0169.0168.0337.0168a.1915.1915 0 0 0 .1348-.0505l3.058-3.3265c.1198-.1159.0135-.2668-.0005-.2672zm-7.6277-.1336-1.5459-1.1704-.151-.0998c-.0337-.0169-.0674-.0506-.1011-.0668l-.1174-.1005c.6597-.659 1.3297-1.3074 1.9996-1.9557-.4874.4844-1.4622 1.9057-1.2606 2.3733.0023 0 .0186.0419.0674.0842.3704.311.7398.6232 1.109.9357zm4.0997 3.1261-1.277-.97a26.9056 26.9056 0 0 0-1.5795-1.5044c.689.5181 1.2769.9694 1.3611 1.053.6722.585.6379.485 1.0922.8696l.5542.4008c-.0735.103-.151.1477-.151.151zm.3357.2503-.0337-.0168c.0506-.0331.1011-.0668.1517-.1168zM.5885 3.4751c.0331.2172.0843.4344.1174.6354.2015 1.103.4031 2.1061.7726 2.8583l.1516.568c.0506.2173.1342.485.2185.5519.8568.7521 2.1674 1.8714 3.5785 2.9419a.1775.1775 0 0 0 .2185 0s0 .0162.0168.0162a.1528.1528 0 0 0 .118.0506.1912.1912 0 0 0 .1341-.0506c1.798-1.9887 3.1418-3.6267 4.0997-4.9974.0674-.0668.0843-.1673.0843-.251.0668-.0668.1173-.1504.1847-.2004.0668-.0668.0668-.184 0-.2346l-.0168-.0163c0-.033-.0169-.0836-.0506-.1005-.42-.4007-.722-.6848-1.0416-.9856A93.5546 93.5546 0 0 1 6.822 1.9876c-.0169-.0169-.0337-.0337-.0674-.0337-.3358-.1168-1.0248-.2341-1.8817-.3845C3.596 1.3527 1.865 1.0519.3027.583c0 0-.1011 0-.118.0169L.1348.6505C.0498.7139.0222.7058 0 .7167.017.8172.017.884.0506 1.0013c0 .0331.0673.3009.0673.334zm7.1909 4.7802-.0337.0337a.0362.0362 0 0 1 .0337-.0337zM6.553 2.238c.101.1005.5211.5019.6216.5855-.4369-.201-1.5284-.7022-2.0333-.8695.5043.1005 1.1933.201 1.4117.284ZM.7901 1.4027c.2521.4344.4537 1.9388.6553 3.4095-.118-.4682-.2016-.9357-.3027-1.3708C.9917 2.673.84 1.9876.6385 1.3858c.1232 0 .1516.0212.1516.0169zm-.2858-.3683c0-.0162 0-.033-.0169-.033.0843 0 .1342.0168.2016.0499.0006.0057-.1448-.0169-.1847-.0169zM23.6738.8172c.0169-.0662-.3358-.367-.2184-.3845.2527-.0163.2527-.4008 0-.4008-.3358.0169-.6884.0999-1.008.1504-.5878.1168-1.1926.2341-1.781.3671-1.327.2846-2.6375.5855-3.9481.937-.4032.1167-.857.2003-1.2432.4007-.1348.0668-.118.2004-.0506.284-.0337.0169-.0505.0169-.0842.0337-.1174.0169-.2185.0337-.3358.05-.1011.0168-.1516.1004-.1348.201 0 .0162.0169.0499.0169.0661-.7059.9363-1.4954 1.9226-2.3523 2.9757-.84.9694-1.7306 1.9893-2.6212 3.0424-2.8396 3.3096-6.0487 7.0705-9.5936 10.38a.1613.1613 0 0 0 0 .2341c.0169.0163.0337.0331.0506.0331-.0506.0506-.1011.0843-.1517.1336-.0337.0337-.0505.0668-.0505.1005a.364.364 0 0 0-.0668.0837c-.0674.0667-.0674.1835.0169.234.0667.0662.1847.0662.2346-.0168.0175-.0169.0175-.0337.0337-.0337a.2648.2648 0 0 1 .3701 0c.2016.2178.4032.435.588.6186l-.4201-.3508c-.0674-.0668-.1847-.05-.2347.0168-.068.0662-.0511.1835.0163.234l4.4691 3.7273c.0337.0337.0674.0337.118.0337.0505 0 .0842-.0169.1173-.0506l.101-.0999c.017.0163.05.0163.0669.0163.0505 0 .0842-.0163.118-.05 6.0486-6.0505 10.9216-10.6141 16.4997-14.6927.05-.0331.0668-.1.0668-.1505.0674 0 .118-.05.151-.1167 1.0254-3.1255 1.227-5.9007 1.2938-7.2709 0-.0579.0169-.0371.0169-.0668.0168-.0337.0168-.0505.0168-.0505a.9784.9784 0 0 0-.0668-.6186zm-10.82 4.9144c.2684-.3008.5374-.6186.8064-.9026-1.7306 2.2734-4.6033 5.7665-8.67 9.9288C7.7626 11.699 10.5517 8.54 12.854 5.7316ZM5.1414 23.4662c-.0162-.0168-.0162-.0168 0-.0168zm2.5033-2.156c.1348-.1505.2695-.284.4206-.4345 0 0 0 .0163.0168.0163-.2236.1978-.4334.4182-.4374.4182zm.6896-.6686c.0994-.0993.14-.1724.2852-.3177.9917-1.0193 2.0164-2.0393 3.058-3.0755l.0169-.0168c.2521-.2004.5542-.4177.8232-.6186a228.0627 228.0627 0 0 0-4.1833 4.0286zm6.5187-16.732c-.5543.719-1.1759 1.6716-1.697 2.4238-1.6463 2.3733-6.9393 8.1735-7.0566 8.274A1189.6473 1189.6473 0 0 1 1.26 19.204l-.1005.1005c-.0843-.1005-.0843-.251.0168-.3346 7.476-7.0037 12.0132-12.837 13.845-15.3944-.0506.1167-.0843.2166-.1685.334zm2.9064 3.4269c-.6716-.3851-.9905-.9869-.8064-1.5712l.0506-.201a.7753.7753 0 0 1 .0842-.1666c.1848-.301.4538-.5518.7564-.7023.0163 0 .0331 0 .05-.0168-.0169-.0337-.0169-.0837-.0169-.1336.0169-.1005.0843-.1673.2016-.1673.2016 0 .8238.1841 1.059.3845.0669.05.1343.1168.2017.1836.0842.1004.2184.2677.2852.4013.0337.0169.0674.1841.118.2678.0336.1336.0667.284.0505.4176-.0169.0169 0 .1167-.0169.1167a1.6055 1.6055 0 0 1-.2184.6186c-.0307.0307.0064.0119-.0505.0668-.0843.1342-.2016.251-.319.3346-.3869.2672-.8238.3508-1.2606.234-.1105-.0473-.1672-.0667-.1685-.0667zm4.3692 1.4039c0 .0168-.0168.0499 0 .0667-.0337 0-.0505.0169-.0842.0337-1.3274.9689-2.6212 1.9888-3.915 3.0256 1.109-.9868 2.218-1.9894 3.3776-2.9756.3358-.3009.5711-.6854.6379-1.1199l.1685-1.003v-.0332c.0842-.201.4032-.1173.3526.1-.0042-.0012-.1731.795-.5374 1.9057z" />
            </svg>
            <span className="font-semibold text-gray-900 text-base tracking-tight">
              Excalidraw{" "}
              <span className="text-gray-400 font-light mx-1">x</span>{" "}
              CopilotKit
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/workspaces"
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors px-2.5 py-1.5 rounded-md hover:bg-gray-50 border border-transparent hover:border-gray-200 cursor-pointer"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              Workspaces
            </Link>
            <button
              onClick={() => setQrOpen(true)}
              className="flex items-center justify-center w-8 h-8 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors cursor-pointer"
              title="QR Code Pick"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                <rect x="2" y="2" width="8" height="8" rx="1" />
                <rect x="14" y="2" width="8" height="8" rx="1" />
                <rect x="2" y="14" width="8" height="8" rx="1" />
                <rect x="14" y="14" width="4" height="4" rx="0.5" />
                <line x1="22" y1="14" x2="22" y2="18" />
                <line x1="18" y1="22" x2="22" y2="22" />
                <rect x="5" y="5" width="2" height="2" rx="0.25" fill="currentColor" stroke="none" />
                <rect x="17" y="5" width="2" height="2" rx="0.25" fill="currentColor" stroke="none" />
                <rect x="5" y="17" width="2" height="2" rx="0.25" fill="currentColor" stroke="none" />
              </svg>
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center justify-center w-8 h-8 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors cursor-pointer"
              title="Settings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </nav>
        <SettingsPanel
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          selectedSkillId={selectedSkillId}
          onSelect={setSelectedSkillId}
        />
        <QrModal isOpen={qrOpen} onClose={() => setQrOpen(false)} sessionId={qrSessionId} scanStatus={scanStatus} />
        {urlCheckpointId && <CheckpointBanner checkpointId={urlCheckpointId} />}
        <div className="flex-1 flex justify-center overflow-hidden min-h-0 pt-28">
          <div className="w-full max-w-2xl h-full flex flex-col">
            <InlineAgentStatus />
            <CopilotChat
              className="flex-1 min-h-0"
              labels={{
                welcomeMessageText: urlCheckpointId
                  ? "What would you like to change?"
                  : "What should I draw?",
                chatInputPlaceholder: urlCheckpointId
                  ? "Describe your changes…"
                  : "Describe an architecture, flow, or sequence diagram…",
                chatDisclaimerText: "",
              }}
            />
            <WelcomePortal>
              {urlCheckpointId ? (
                <div className="pt-4 pb-4 flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 text-[#6965db]">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="animate-spin"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    <p className="text-sm text-gray-500">
                      Loading your diagram...
                    </p>
                  </div>
                  <p className="text-[11px] font-medium text-gray-400 tracking-wider select-none mt-2">
                    Or describe a change
                  </p>
                  <div className="flex items-center gap-3">
                    {EDIT_SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        className="text-xs text-[#6965db] bg-[#6965db]/5 hover:bg-[#6965db]/10 border border-[#6965db]/20 rounded-full px-3 py-1.5 transition-colors cursor-pointer whitespace-nowrap"
                        onClick={() => {
                          const input = document.querySelector<
                            HTMLTextAreaElement | HTMLInputElement
                          >("textarea, input[type='text']");
                          if (input) {
                            const nativeInputValueSetter =
                              Object.getOwnPropertyDescriptor(
                                window.HTMLTextAreaElement.prototype,
                                "value",
                              )?.set ??
                              Object.getOwnPropertyDescriptor(
                                window.HTMLInputElement.prototype,
                                "value",
                              )?.set;
                            nativeInputValueSetter?.call(input, s);
                            input.dispatchEvent(
                              new Event("input", { bubbles: true }),
                            );
                            input.focus();
                          }
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2.5 px-6 pt-3 pb-1">
                    {CARDS.map(({ icon, title, desc }) => (
                      <div
                        key={title}
                        className="flex items-start gap-2.5 p-3 rounded-xl border border-gray-100"
                      >
                        <div className="w-7 h-7 rounded-lg bg-[#6965db]/10 text-[#6965db] flex items-center justify-center shrink-0 mt-0.5">
                          {icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 leading-snug">
                            {title}
                          </p>
                          <p className="text-xs text-gray-400 leading-snug mt-0.5">
                            {desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="pt-6 pb-4 flex flex-col items-center gap-2">
                    <p className="text-[11px] font-medium text-gray-500 tracking-wider select-none">
                      Try this Prompt
                    </p>
                    <div className="flex items-center gap-4">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          className="text-xs text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full px-3 py-1.5 transition-colors cursor-pointer whitespace-nowrap"
                          onClick={() => {
                            const input = document.querySelector<
                              HTMLTextAreaElement | HTMLInputElement
                            >("textarea, input[type='text']");
                            if (input) {
                              const nativeInputValueSetter =
                                Object.getOwnPropertyDescriptor(
                                  window.HTMLTextAreaElement.prototype,
                                  "value",
                                )?.set ??
                                Object.getOwnPropertyDescriptor(
                                  window.HTMLInputElement.prototype,
                                  "value",
                                )?.set;
                              nativeInputValueSetter?.call(input, s);
                              input.dispatchEvent(
                                new Event("input", { bubbles: true }),
                              );
                              input.focus();
                            }
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </WelcomePortal>
          </div>
        </div>
      </main>
    </>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
