import { useState, useRef, useEffect } from "react";

interface ConfirmModalProps {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement;
    textareaRef.current?.focus();
    return () => {
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  const canConfirm = reason.trim().length >= 10 && !submitting;

  const handleSubmit = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      onConfirm(reason.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000]"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="bg-bg-surface border border-border rounded-xl p-6 max-w-[480px] w-full shadow-lg animate-in">
        <h3 className="text-base font-semibold text-text-primary m-0 mb-2">{title}</h3>
        <p className="text-text-secondary text-sm m-0 mb-4">{description}</p>

        <label className="block text-text-secondary text-xs mb-1.5">
          Reason (minimum 10 characters):
        </label>
        <textarea
          ref={textareaRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full bg-bg-base text-text-primary border border-border rounded-md p-2.5 font-sans text-sm resize-y focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent placeholder:text-text-muted"
          placeholder="Enter reason for this action..."
        />
        {reason.length > 0 && reason.trim().length < 10 && (
          <p className="text-warning text-xs mt-1">{10 - reason.trim().length} more characters needed</p>
        )}

        <div className="flex gap-2 justify-end mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-transparent text-text-secondary border border-border rounded-md cursor-pointer text-sm hover:bg-bg-elevated hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canConfirm}
            className={`px-4 py-2 rounded-md text-sm font-semibold border-none transition-colors ${
              canConfirm
                ? "bg-danger text-white cursor-pointer hover:brightness-110"
                : "bg-bg-elevated text-text-muted cursor-not-allowed"
            }`}
          >
            {submitting ? "..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
