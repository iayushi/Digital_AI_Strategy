"use client";

import { TEST_STUDENTS, STARTING_CREDITS, getCredits } from "@/lib/credits";

interface StudentGateProps {
  onLogin: (studentId: string) => void;
}

// Pilot-test login screen: pick one of two hardcoded student accounts to try
// the starter-credit flow. Not real authentication — see lib/credits.ts.
export default function StudentGate({ onLogin }: StudentGateProps) {
  return (
    <div className="flex h-dvh items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Pilot test</p>
        <h1 className="mt-1 text-lg font-semibold text-gray-900">Student LLM starter credits</h1>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
          This test build gives each student {STARTING_CREDITS} free starter credits. Pick a
          test account below to continue.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {TEST_STUDENTS.map((s) => {
            const remaining = getCredits(s.id);
            return (
              <button
                key={s.id}
                onClick={() => onLogin(s.id)}
                className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:border-blue-400 hover:bg-blue-50 transition-colors"
              >
                <span>{s.name}</span>
                <span className={`text-xs font-normal ${remaining > 0 ? "text-gray-500" : "text-red-500"}`}>
                  🪙 {remaining} credit{remaining === 1 ? "" : "s"} left
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
