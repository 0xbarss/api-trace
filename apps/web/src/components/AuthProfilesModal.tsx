import React, { useState } from "react";
import { X, AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import type {
  AuthProfileSlot,
  AuthProfilesInput,
  AuthProfilesSummary,
} from "../types.js";

interface AuthProfilesModalProps {
  isOpen: boolean;
  targetName: string;
  saved: AuthProfilesSummary;
  onClose: () => void;
  onSubmit: (profiles: AuthProfilesInput) => Promise<void>;
}

interface SlotDefinition {
  slot: AuthProfileSlot;
  label: string;
  hint: string;
  namePlaceholder: string;
}

const SLOTS: SlotDefinition[] = [
  {
    slot: "primary",
    label: "Tenant A (Primary)",
    hint: "The tenant whose data we try to reach from the other side.",
    namePlaceholder: "Tenant A",
  },
  {
    slot: "secondary",
    label: "Tenant B (Secondary)",
    hint: "Should get turned away when it asks for Tenant A's data.",
    namePlaceholder: "Tenant B",
  },
  {
    slot: "unprivileged",
    label: "Unprivileged user",
    hint: "A regular user, used to knock on admin routes. Skip it and we'll use Tenant B.",
    namePlaceholder: "Regular user",
  },
];

type DraftValues = Record<AuthProfileSlot, { name: string; token: string }>;

export function createEmptyDraft(): DraftValues {
  return {
    primary: { name: "", token: "" },
    secondary: { name: "", token: "" },
    unprivileged: { name: "", token: "" },
  };
}

export function buildAuthProfilesInput(draft: DraftValues): AuthProfilesInput {
  const result: AuthProfilesInput = {};
  for (const { slot, label } of SLOTS) {
    const name = draft[slot].name.trim();
    const token = draft[slot].token.trim();
    if (!name && !token) {
      continue;
    }
    if (!name || !token) {
      throw new Error(`Add both a name and a token for ${label}, or clear both.`);
    }
    result[slot] = { name, token };
  }
  return result;
}

export function AuthProfilesModal({
  isOpen,
  targetName,
  saved,
  onClose,
  onSubmit,
}: AuthProfilesModalProps): React.ReactElement | null {
  const [draft, setDraft] = useState<DraftValues>(createEmptyDraft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  React.useEffect(() => {
    if (!isOpen) return;
    const next = createEmptyDraft();
    for (const { slot } of SLOTS) {
      next[slot].name = saved[slot]?.name ?? "";
    }
    setDraft(next);
    setError(null);
  }, [isOpen, saved]);

  if (!isOpen) return null;

  const updateField = (slot: AuthProfileSlot, field: "name" | "token", value: string) => {
    setDraft((prev) => ({ ...prev, [slot]: { ...prev[slot], [field]: value } }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let profiles: AuthProfilesInput;
    try {
      profiles = buildAuthProfilesInput(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    try {
      setLoading(true);
      await onSubmit(profiles);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-xs animate-in fade-in duration-150 cursor-pointer m-0"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-zinc-200 shadow-xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh] cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
              Auth profiles
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Tokens for {targetName}. We use them to check that tenants can't see each other's data and that regular users can't reach admin routes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {SLOTS.map(({ slot, label, hint, namePlaceholder }) => (
            <fieldset key={slot} className="space-y-1.5">
              <legend className="text-xs font-medium text-zinc-700 flex items-center gap-1.5">
                {label}
                {saved[slot]?.hasToken && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-normal text-emerald-700">
                    <ShieldCheck className="w-3 h-3" />
                    Token saved
                  </span>
                )}
              </legend>
              <p className="text-[11px] text-zinc-400">{hint}</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  aria-label={`${label} name`}
                  placeholder={namePlaceholder}
                  value={draft[slot].name}
                  onChange={(e) => updateField(slot, "name", e.target.value)}
                  className="h-8 px-3 rounded-md bg-zinc-50 border border-zinc-200 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                />
                <input
                  type="password"
                  autoComplete="off"
                  aria-label={`${label} token`}
                  placeholder={saved[slot]?.hasToken ? "Paste again to keep" : "Bearer token"}
                  value={draft[slot].token}
                  onChange={(e) => updateField(slot, "token", e.target.value)}
                  className="h-8 px-3 rounded-md bg-zinc-50 border border-zinc-200 text-xs font-mono text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                />
              </div>
            </fieldset>
          ))}

          <p className="text-[11px] text-zinc-400">
            Saving replaces everything here. We never show saved tokens again, so paste the
            token again for any profile you want to keep.
          </p>

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-md text-xs text-zinc-600 hover:bg-zinc-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
            >
              {loading && <Loader2 className="w-3 h-3 animate-spin" />}
              Save profiles
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
