"use client";

import { useState } from "react";
import { MessageSquareText, Send } from "lucide-react";
import { useAccount, useConnect, useSignMessage } from "wagmi";

const options = [
  { value: "useful", label: "Useful" },
  { value: "unclear", label: "Unclear" },
  { value: "wrong", label: "Wrong" },
  { value: "copied", label: "I copied" },
];

function feedbackMessage(input: { callId: number | undefined; agentId: number | undefined; wallet: string; sentiment: string; context: string; comment: string }) {
  return [
    "Precall Arena feedback",
    `Call: ${input.callId ?? "none"}`,
    `Agent: ${input.agentId ?? "none"}`,
    `Wallet: ${input.wallet}`,
    `Sentiment: ${input.sentiment}`,
    `Context: ${input.context}`,
    `Comment: ${input.comment.slice(0, 700)}`,
  ].join("\n");
}

export function FeedbackCapture({ callId, agentId, context }: { callId?: number; agentId?: number; context: string }) {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const [sentiment, setSentiment] = useState("useful");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState("");

  async function submit() {
    if (!isConnected || !address) {
      if (connectors[0]) connect({ connector: connectors[0] });
      return;
    }
    setStatus("Sign feedback in your wallet...");
    const message = feedbackMessage({ callId, agentId, wallet: address, sentiment, context, comment });
    const signature = await signMessageAsync({ message });
    setStatus("Saving signed feedback...");
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callId, agentId, wallet: address, sentiment, comment, context, message, signature }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setStatus(payload.error || "Feedback failed.");
      return;
    }
    setComment("");
    setStatus("Signed feedback saved. This helps rank what users actually trust.");
  }

  return (
    <section className="feedback-box">
      <h3><MessageSquareText size={18} /> Quick feedback</h3>
      <div className="pill-row compact">
        {options.map((option) => (
          <button className={`pill option-pill ${sentiment === option.value ? "active" : ""}`} key={option.value} onClick={() => setSentiment(option.value)} type="button">
            {option.label}
          </button>
        ))}
      </div>
      <textarea aria-label="Feedback note" onChange={(event) => setComment(event.target.value)} placeholder="Optional note for the builders or agent ranking..." rows={3} value={comment} />
      <button className="button secondary" onClick={submit} type="button">
        <Send size={16} /> {isConnected ? "Send feedback" : "Connect to send"}
      </button>
      {status ? <p className="muted">{status}</p> : null}
    </section>
  );
}
