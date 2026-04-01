"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const ARCHITECTURE_PROMPTS = [
  {
    id: "microservices",
    title: "Microservices",
    desc: "A cloud-native microservices architecture with API gateway, service mesh, and message queue",
    prompt:
      "Draw a microservices architecture with an API gateway, 4 backend services (auth, users, orders, payments), a message queue connecting them, and a shared database layer. Use clean layout with color-coded zones.",
  },
  {
    id: "event-driven",
    title: "Event-Driven",
    desc: "An event-driven system with producers, event bus, and consumer services",
    prompt:
      "Draw an event-driven architecture with 3 producer services on the left, a central event bus / message broker in the middle, and 4 consumer services on the right, with a dead letter queue and monitoring dashboard. Use arrows to show event flow.",
  },
  {
    id: "serverless",
    title: "Serverless",
    desc: "A serverless architecture on AWS with Lambda, API Gateway, and DynamoDB",
    prompt:
      "Draw a serverless architecture diagram showing: client app → API Gateway → Lambda functions (3 of them for different endpoints) → DynamoDB and S3 for storage, with CloudWatch for monitoring and Cognito for auth. Show the data flow with arrows.",
  },
];

function PickForm() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Notify the main app that someone opened this page (scanned the QR)
  useEffect(() => {
    if (sessionId) {
      fetch("/api/pick", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <p className="text-gray-500 text-center">
          Invalid link. Scan the QR code from the main screen to get started.
        </p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 gap-4">
        <div className="w-16 h-16 rounded-full bg-[#6965db]/10 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6965db" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-800">Submitted!</h2>
        <p className="text-gray-500 text-center text-sm max-w-xs">
          Look at the main screen — your architecture diagram is being generated now.
        </p>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!selected) return;
    const choice = ARCHITECTURE_PROMPTS.find((p) => p.id === selected);
    if (!choice) return;

    setSubmitting(true);
    try {
      await fetch("/api/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, prompt: choice.prompt }),
      });
      setSubmitted(true);
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#6965db">
            <path d="M23.9428 19.8058a.1962.1962 0 0 0-.1679-.0337c-1.26-1.8552-2.8727-3.6104-4.4186-5.3152l-.2521-.284c-.0016-.0732-.0667-.1207-.1342-.1504-.0284-.0277-.0562-.0558-.0843-.0837-.0505-.1005-.1685-.1673-.2858-.1005-.4706.2347-.9068.5855-1.3274.9195-.5536.4345-1.1085.8695-1.6296 1.354a5.0577 5.0577 0 0 0-.5879.6185c-.0842.1168-.0168.2172.0843.2672-.3701.3677-.7402.736-1.109 1.1198a.1896.1896 0 0 0-.0506.1342c0 .05.0337.1.0668.1168l.6559.5012v.0169c.9237.9194 2.5538 2.1729 4.2844 3.5268.2515.201.5205.4014.7727.6017.1173.1342.2346.2847.3357.4182.0506.0662.1685.0837.2353.0331.0337.0337.0843.0668.118.1005a.2395.2395 0 0 0 .1004.0337.1534.1534 0 0 0 .1348-.0668.2371.2371 0 0 0 .0331-.1004c.0175 0 .0169.0168.0337.0168a.1915.1915 0 0 0 .1348-.0505l3.058-3.3265c.1198-.1159.0135-.2668-.0005-.2672zM.5885 3.4751c.0331.2172.0843.4344.1174.6354.2015 1.103.4031 2.1061.7726 2.8583l.1516.568c.0506.2173.1342.485.2185.5519.8568.7521 2.1674 1.8714 3.5785 2.9419a.1775.1775 0 0 0 .2185 0s0 .0162.0168.0162a.1528.1528 0 0 0 .118.0506.1912.1912 0 0 0 .1341-.0506c1.798-1.9887 3.1418-3.6267 4.0997-4.9974.0674-.0668.0843-.1673.0843-.251.0668-.0668.1173-.1504.1847-.2004.0668-.0668.0668-.184 0-.2346l-.0168-.0163c0-.033-.0169-.0836-.0506-.1005-.42-.4007-.722-.6848-1.0416-.9856z" />
          </svg>
          <h1 className="text-lg font-semibold text-gray-900">Excalidraw Studio</h1>
        </div>
        <p className="text-sm text-gray-500">Pick a design pattern to generate on the big screen</p>
      </div>

      {/* Cards */}
      <div className="flex-1 px-6 pb-6 flex flex-col gap-3">
        {ARCHITECTURE_PROMPTS.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            className={`text-left p-4 rounded-2xl border-2 transition-all ${
              selected === p.id
                ? "border-[#6965db] bg-[#6965db]/5 shadow-md shadow-[#6965db]/10"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <p className={`text-base font-semibold ${selected === p.id ? "text-[#6965db]" : "text-gray-800"}`}>
              {p.title}
            </p>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">{p.desc}</p>
          </button>
        ))}

        <button
          onClick={handleSubmit}
          disabled={!selected || submitting}
          className={`mt-auto w-full py-3.5 rounded-2xl text-white font-semibold text-base transition-all ${
            selected && !submitting
              ? "bg-[#6965db] hover:bg-[#5b57c9] active:scale-[0.98] shadow-lg shadow-[#6965db]/25"
              : "bg-gray-300 cursor-not-allowed"
          }`}
        >
          {submitting ? "Submitting..." : "Generate Diagram"}
        </button>
      </div>
    </div>
  );
}

export default function PickPage() {
  return (
    <Suspense>
      <PickForm />
    </Suspense>
  );
}
