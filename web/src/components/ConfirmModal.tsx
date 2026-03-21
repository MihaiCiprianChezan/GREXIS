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
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        style={{
          backgroundColor: "#16213e",
          border: "1px solid #0f3460",
          borderRadius: "8px",
          padding: "24px",
          maxWidth: "480px",
          width: "100%",
        }}
      >
        <h3 style={{ margin: "0 0 8px", color: "#e0e0e0" }}>{title}</h3>
        <p style={{ color: "#aaa", fontSize: "0.9rem", margin: "0 0 16px" }}>
          {description}
        </p>
        <label style={{ display: "block", color: "#ccc", fontSize: "0.85rem", marginBottom: "6px" }}>
          Reason (minimum 10 characters):
        </label>
        <textarea
          ref={textareaRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          style={{
            width: "100%",
            boxSizing: "border-box",
            backgroundColor: "#1a1a2e",
            color: "#e0e0e0",
            border: "1px solid #0f3460",
            borderRadius: "4px",
            padding: "8px",
            fontFamily: "inherit",
            fontSize: "0.9rem",
            resize: "vertical",
          }}
          placeholder="Enter reason for this action..."
        />
        {reason.length > 0 && reason.trim().length < 10 && (
          <p style={{ color: "#e09f3e", fontSize: "0.8rem", margin: "4px 0 0" }}>
            {10 - reason.trim().length} more characters needed
          </p>
        )}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              backgroundColor: "transparent",
              color: "#ccc",
              border: "1px solid #555",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canConfirm}
            style={{
              padding: "8px 16px",
              backgroundColor: canConfirm ? "#d62828" : "#555",
              color: canConfirm ? "#fff" : "#888",
              border: "none",
              borderRadius: "4px",
              cursor: canConfirm ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
          >
            {submitting ? "..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
