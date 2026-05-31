"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

// Tailwind-styled element renderers so Markdown output matches the chat UI
// without pulling in @tailwindcss/typography.
const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 last:mb-0 list-disc pl-5 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 last:mb-0 list-decimal pl-5 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h1 className="text-base font-semibold mb-2 mt-1">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-semibold mb-2 mt-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-1">{children}</h3>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-words">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-gray-300 pl-3 italic text-gray-600 mb-2">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-gray-200" />,
  code: ({ className, children, ...props }) => {
    // Block code carries a language-* class (added by Markdown for fenced
    // blocks); inline code does not. Style them differently.
    const isBlock = typeof className === "string" && className.includes("language-");
    if (isBlock) {
      return (
        <code className={`${className ?? ""} hljs`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-gray-100 px-1 py-0.5 text-[0.85em] font-mono text-gray-800" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-2 last:mb-0 overflow-x-auto rounded-lg bg-gray-50 border border-gray-200 p-3 text-[0.85em] font-mono">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-2 last:mb-0 overflow-x-auto">
      <table className="w-full border-collapse text-[0.9em]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-gray-200 px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border border-gray-200 px-2 py-1 align-top">{children}</td>,
};

/**
 * Render assistant text as Markdown (GitHub-flavoured) with syntax-highlighted
 * code blocks. Used for assistant messages and the live streaming bubble.
 */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={MARKDOWN_COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
