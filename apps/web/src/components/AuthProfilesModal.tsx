import React, { useState } from "react";
import { X, AlertCircle, Loader2, ShieldCheck, Info } from "lucide-react";
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
  role: string;
  hint: string;
  namePlaceholder: string;
  tokenPlaceholder: string;
}

const SLOTS: SlotDefinition[] = [
  {
    slot: "primary",
    label: "Primary user",
    role: "Your main account. The engine uses this token to call authenticated endpoints, check whether numeric fields can be overwritten, and scan responses for exposed card data.",
    hint: "The account whose data belongs to them.",
    namePlaceholder: "alice",
    tokenPlaceholder: "eyJhbGci… or my-api-key-123",
  },
  {
    slot: "secondary",
    label: "Second user",
    role: "A different account. The engine signs in as this user and tries to read the primary user's resources. A well-secured API should block it.",
    hint: "Someone who should not be able to see the primary user's data.",
    namePlaceholder: "bob",
    tokenPlaceholder: "eyJhbGci… or another-api-key",
  },
  {
    slot: "unprivileged",
    label: "Low-privilege user",
    role: "A regular customer account with no admin rights. Used to test whether admin and audit routes turn away non-admin callers. Leave this blank and the engine will reuse the second user.",
    hint: "A standard account with no elevated permissions.",
    namePlaceholder: "charlie",
    tokenPlaceholder: "eyJhbGci… or low-priv-key",
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
      throw new Error(`Add both a name and a token for "${label}", or clear both.`);
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
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
              Auth profiles — {targetName}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Paste the tokens for {targetName}. The engine uses them to run cross-tenant and privilege-escalation checks.
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

        {/* Token format note */}
        <div className="mx-5 mt-4 flex items-start gap-2 rounded-md bg-sky-50 border border-sky-100 px-3 py-2 text-[11px] text-sky-700">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Paste the raw token, no <code className="font-mono bg-sky-100 px-0.5 rounded">Bearer </code> prefix. JWT tokens and static API keys both work.
          </span>
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-5 pt-3 space-y-5 overflow-y-auto">
          {/* Column headers */}
          <div className="grid grid-cols-2 gap-2 px-0">
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider pl-0.5">Display name</span>
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider pl-0.5">Token / API key</span>
          </div>

          {SLOTS.map(({ slot, label, role, hint, namePlaceholder, tokenPlaceholder }) => (
            <fieldset key={slot} className="space-y-1.5">
              <legend className="text-xs font-semibold text-zinc-800 flex items-center gap-2">
                {label}
                {saved[slot]?.hasToken && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-normal text-emerald-700">
                    <ShieldCheck className="w-3 h-3" />
                    Token saved
                  </span>
                )}
              </legend>
              <p className="text-[11px] text-zinc-500 leading-relaxed">{role}</p>
              <p className="text-[10px] text-zinc-400 italic">{hint}</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  aria-label={`${label} display name`}
                  placeholder={namePlaceholder}
                  value={draft[slot].name}
                  onChange={(e) => updateField(slot, "name", e.target.value)}
                  className="h-8 px-3 rounded-md bg-zinc-50 border border-zinc-200 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                />
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={`${label} token`}
                  placeholder={saved[slot]?.hasToken ? "Paste again to update" : tokenPlaceholder}
                  value={draft[slot].token}
                  onChange={(e) => updateField(slot, "token", e.target.value)}
                  className="h-8 px-3 rounded-md bg-zinc-50 border border-zinc-200 text-xs font-mono text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                />
              </div>
            </fieldset>
          ))}

          <p className="text-[11px] text-zinc-400">
            Only the primary token is needed for most checks. Saving overwrites what was stored, and tokens are never shown again after that.
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
