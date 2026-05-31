"use client";

import { useEffect, useRef } from "react";
import Markdown from "./Markdown";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  messages: Message[];
  streamText: string;
  isStreaming: boolean;
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-blue-600 text-white rounded-br-sm whitespace-pre-wrap"
            : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
        }`}
      >
        {isUser ? msg.content : <Markdown>{msg.content}</Markdown>}
      </div>
    </div>
  );
}

export default function ChatWindow({ messages, streamText, isStreaming }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
      {isEmpty && (
        <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 select-none">
          <div className="text-4xl mb-3">🎓</div>
          <p className="text-sm font-medium">Ask a question about this week&apos;s lecture</p>
          <p className="text-xs mt-1">Or pick one from Sample Questions above</p>
        </div>
      )}

      {messages.map((msg, i) => (
        <MessageBubble key={i} msg={msg} />
      ))}

      {/* Streaming response */}
      {isStreaming && (
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed bg-white border border-gray-200 text-gray-800 shadow-sm">
            {streamText ? (
              <Markdown>{streamText}</Markdown>
            ) : (
              <span className="flex items-center gap-1 text-gray-400">
                <span className="animate-bounce">●</span>
                <span className="animate-bounce [animation-delay:0.15s]">●</span>
                <span className="animate-bounce [animation-delay:0.3s]">●</span>
              </span>
            )}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
