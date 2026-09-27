import React, { useEffect } from "react";
import { X, AlertTriangle, CheckCircle, Info, Trash2, Loader2 } from "lucide-react";

export interface DialogProps {
  isOpen: boolean;
  title: string;
  description: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger" | "success" | "info";
  loading?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function Dialog({
  isOpen,
  title,
  description,
  confirmText,
  cancelText,
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
}: DialogProps): React.ReactElement | null {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (onCancel) {
          onCancel();
        } else {
          onConfirm();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel, onConfirm]);

  if (!isOpen) return null;

  const resolvedConfirmText = confirmText ?? (cancelText ? "Confirm" : "OK");

  const getIcon = () => {
    switch (variant) {
      case "danger":
        return (
          <div className="w-9 h-9 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
            <Trash2 className="w-4 h-4 text-rose-600" />
          </div>
        );
      case "success":
        return (
          <div className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
        );
      case "info":
        return (
          <div className="w-9 h-9 rounded-full bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0">
            <Info className="w-4 h-4 text-sky-600" />
          </div>
        );
      default:
        return (
          <div className="w-9 h-9 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
        );
    }
  };

  const getConfirmButtonClasses = () => {
    switch (variant) {
      case "danger":
        return "bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white";
      case "success":
        return "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white";
      case "info":
        return "bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-950 text-white";
      default:
        return "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white";
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-xs animate-in fade-in duration-150 m-0"
    >
      <div
        className="fixed inset-0"
        onClick={loading ? undefined : onCancel ?? onConfirm}
      />
      <div className="relative w-full max-w-md bg-white rounded-xl border border-zinc-200 shadow-xl p-5 space-y-4 z-10 animate-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3.5">
          {getIcon()}
          <div className="flex-1 min-w-0 pr-6">
            <h3 className="text-sm font-bold text-zinc-900 leading-tight">
              {title}
            </h3>
            <div className="mt-1 text-xs text-zinc-600 leading-relaxed">
              {description}
            </div>
          </div>
          <button
            type="button"
            onClick={loading ? undefined : onCancel ?? onConfirm}
            className="absolute top-4 right-4 p-1 text-zinc-400 hover:text-zinc-600 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
          {cancelText && onCancel && (
            <button
              type="button"
              disabled={loading}
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 active:bg-zinc-100 text-xs font-medium text-zinc-700 transition-colors disabled:opacity-50"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 ${getConfirmButtonClasses()}`}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{resolvedConfirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
