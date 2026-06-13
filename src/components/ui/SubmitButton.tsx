"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className = "primary-button h-10 px-6",
  pendingLabel = "Speichere..."
}: {
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={className} disabled={pending} type="submit">
      {pending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
