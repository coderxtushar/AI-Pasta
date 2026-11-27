"use client";
import React, { useEffect, useState } from "react";
import { PROVIDERS, PROVIDER_IDS, type ApiKeys, type ProviderId } from "../library/providers";
import { clearKeys, loadKeys, saveKeys } from "../library/keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  /** Called with the current keys after a save or clear. */
  onChange?: (keys: ApiKeys) => void;
};

export default function ApiKeyManager({ onChange }: Props) {
  const [keys, setKeys] = useState<ApiKeys>({});
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setKeys(loadKeys());
  }, []);

  const flash = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(null), 2000);
  };

  const save = () => {
    try {
      saveKeys(keys);
      onChange?.(loadKeys());
      flash("Saved");
    } catch {
      flash("Save failed");
    }
  };

  const clear = () => {
    clearKeys();
    setKeys({});
    onChange?.({});
    flash("Cleared");
  };

  const update = (provider: ProviderId, value: string) => {
    setKeys((prev) => ({ ...prev, [provider]: value }));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {PROVIDER_IDS.map((id) => (
          <div key={id} className="grid gap-1.5">
            <Label htmlFor={`key-${id}`} className="text-xs text-muted-foreground">
              {PROVIDERS[id].label}
            </Label>
            <Input
              id={`key-${id}`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={`${PROVIDERS[id].label} Key`}
              value={keys[id] ?? ""}
              onChange={(e) => update(id, e.target.value)}
              className="font-mono text-[13px]"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={save}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={clear}>
          Clear Keys
        </Button>
        {status && (
          <span role="status" className="text-xs text-muted-foreground">
            {status}
          </span>
        )}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Keys are stored in this browser&apos;s localStorage and sent only with the request for that
        provider&apos;s model. Sign in to keep them encrypted in your account instead.
      </p>
    </div>
  );
}
