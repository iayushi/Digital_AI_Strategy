"use client";

import { useState } from "react";
import { Session } from "@/lib/sessions";

interface Props {
  session: Session;
  onSelect: (question: string) => void;
  disabled: boolean;
}

export default function SampleQuestions({ session, onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-gray-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span>💡 Sample Questions</span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {session.sampleQuestions.map((sq) => (
            <button
              key={sq.label}
              disabled={disabled}
              onClick={() => {
                onSelect(sq.question);
                setOpen(false);
              }}
              className="text-left text-xs px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sq.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
