import { Info, ChevronDown } from "lucide-react";
import { useState } from "react";

export function PageHeader({
  title,
  description,
  tip,
  children,
}: {
  title: string;
  description: string;
  tip?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [showTip, setShowTip] = useState(false);

  return (
    <div className="mb-6 animate-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold tracking-tight m-0">{title}</h1>
          <p className="text-text-muted text-sm mt-1 mb-0 max-w-[720px] leading-relaxed">
            {description}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {children}
          {tip && (
            <button
              onClick={() => setShowTip((s) => !s)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-muted hover:text-accent bg-transparent border border-border hover:border-accent-muted rounded-md cursor-pointer transition-colors press-scale"
              title="How does this work?"
            >
              <Info size={13} />
              <span>How it works</span>
              <ChevronDown
                size={12}
                className="transition-transform duration-200"
                style={{ transform: showTip ? "rotate(180deg)" : "rotate(0)" }}
              />
            </button>
          )}
        </div>
      </div>
      {tip && showTip && (
        <div className="animate-expand mt-3 bg-bg-surface border border-accent-muted rounded-lg px-4 py-3 text-sm text-text-secondary leading-relaxed max-w-[800px]">
          {tip}
        </div>
      )}
    </div>
  );
}
