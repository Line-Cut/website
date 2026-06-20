"use client";

import { useId, useRef, useState } from "react";
import type { Dictionary } from "@/lib/dictionary";
import { validateFiles } from "@/lib/stickers/file-validation";
import { stickerConfig } from "@/lib/stickers/sticker-config";
import { interpolate } from "@/lib/stickers/format";
import { cn } from "@/lib/utils";

type Props = {
  existingCount: number;
  dict: Dictionary["stickers"];
  onAdd: (accepted: File[]) => void;
  disabled?: boolean;
};

export function StickerUploader({ existingCount, dict, onAdd, disabled }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function processFiles(files: File[]) {
    const result = validateFiles(files, existingCount, stickerConfig);
    const newErrors: string[] = [];

    // Build per-reason reject messages
    const typeRejects = result.rejected.filter((r) => r.reason === "type");
    const bigRejects = result.rejected.filter((r) => r.reason === "tooBig");
    const limitRejects = result.rejected.filter((r) => r.reason === "overLimit");

    if (typeRejects.length > 0) {
      newErrors.push(
        interpolate(dict.errors.notWebp, { name: typeRejects[0].file.name }),
      );
    }

    if (bigRejects.length > 0) {
      // Format size limit as a human-readable string (e.g. "5MB")
      const limitMb = Math.round(stickerConfig.maxFileBytes / (1024 * 1024));
      newErrors.push(
        interpolate(dict.errors.tooBig, {
          name: bigRejects[0].file.name,
          limit: `${limitMb}MB`,
        }),
      );
    }

    if (limitRejects.length > 0) {
      newErrors.push(
        interpolate(dict.errors.tooMany, { max: stickerConfig.maxStickers }),
      );
    }

    // Clear errors only when the whole batch was accepted with no rejects
    if (newErrors.length === 0) {
      setErrors([]);
    } else {
      setErrors(newErrors);
    }

    onAdd(result.accepted);

    // Reset so the same file can be re-selected
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (disabled) return;
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) processFiles(files);
  }

  function handleDragOver(e: React.DragEvent<HTMLLabelElement>) {
    if (disabled) return;
    e.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLLabelElement>) {
    // Only clear when leaving the label itself (not a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    if (disabled) return;
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) processFiles(files);
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={inputId}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex min-h-[11rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line p-6 text-center transition-colors",
          dragActive && !disabled && "border-accent bg-accent/5",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "hover:border-accent/60 hover:bg-paper-2",
        )}
        aria-disabled={disabled}
      >
        {/* Hidden real file input */}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/webp"
          multiple
          disabled={disabled}
          onChange={handleChange}
          className="sr-only"
          aria-label={dict.upload.browse}
        />

        {disabled ? (
          <span className="text-sm font-medium text-muted">
            {interpolate(dict.upload.limitHint, { max: stickerConfig.maxStickers })}
          </span>
        ) : (
          <>
            <p className="text-base text-ink">
              {dict.upload.dropPrompt}{" "}
              <span className="font-semibold text-accent underline underline-offset-2">
                {dict.upload.browse}
              </span>
            </p>
            <p className="text-sm text-muted">{dict.upload.mobileHint}</p>
            <p className="text-xs text-muted">{dict.upload.accepted}</p>
            <p className="text-xs text-muted">
              {interpolate(dict.upload.limitHint, { max: stickerConfig.maxStickers })}
            </p>
          </>
        )}
      </label>

      {/* Reject messages — assertive so SR announces immediately */}
      <div role="alert" aria-live="assertive" aria-atomic="true">
        {errors.length > 0 && (
          <ul className="flex flex-col gap-1">
            {errors.map((msg, i) => (
              <li key={i} className="text-sm text-accent">
                {msg}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
