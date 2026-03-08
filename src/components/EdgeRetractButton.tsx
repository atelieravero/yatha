"use client";

import { useTransition } from "react";
import { retractEdge } from "@/app/actions";

export default function EdgeRetractButton({ edgeId }: { edgeId: string }) {
  const [isPending, startTransition] = useTransition();

  const handleRetract = () => {
    // Basic confirmation guard before soft-deleting the edge
    if (window.confirm("Are you sure you want to retract this relationship?")) {
      startTransition(async () => {
        await retractEdge(edgeId);
      });
    }
  };

  return (
    <button
      onClick={handleRetract}
      disabled={isPending}
      className="ml-auto text-xs font-medium text-red-500 opacity-0 group-hover:opacity-100 px-3 py-1.5 hover:bg-red-50 rounded-md transition-opacity disabled:opacity-50 cursor-pointer"
      title="Retract this relationship"
    >
      {isPending ? "Retracting..." : "Retract"}
    </button>
  );
}