"use client";

import { useState } from "react";
import Image from "next/image";
import type { Dictionary } from "@/lib/dictionary";
import { createProductImageUpload } from "@/app/actions/products";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACCEPTED = ["image/webp", "image/jpeg", "image/png"] as const;

type Props = {
  value: string | null;
  onChange: (url: string | null) => void;
  dict: Dictionary["admin"]["products"];
};

export function ImageUpload({ value, onChange, dict }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;

    setError(null);
    if (!ACCEPTED.includes(file.type as (typeof ACCEPTED)[number])) {
      setError(dict.errors.invalid_type);
      return;
    }

    setUploading(true);
    try {
      const res = await createProductImageUpload(file.type);
      if (!res.ok) {
        setError(
          res.message === "invalid_type"
            ? dict.errors.invalid_type
            : dict.errors.upload_failed,
        );
        return;
      }

      // Bytes go browser → S3 directly via the presigned PUT (never through the
      // action). Content-Type must match what was presigned.
      const put = await fetch(res.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) {
        setError(dict.errors.upload_failed);
        return;
      }

      onChange(res.publicUrl);
    } catch {
      setError(dict.errors.upload_failed);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border border-line bg-paper-2">
          {value ? (
            <Image
              src={value}
              alt=""
              fill
              sizes="96px"
              unoptimized
              className="object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] text-muted">
              {dict.noImage}
            </span>
          )}
        </div>

        <div className="flex flex-col items-start gap-2">
          <label className="inline-flex">
            <input
              type="file"
              accept={ACCEPTED.join(",")}
              onChange={handleFile}
              disabled={uploading}
              className="sr-only"
            />
            <span
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "cursor-pointer",
                uploading && "pointer-events-none opacity-50",
              )}
            >
              {uploading ? dict.uploading : dict.uploadImage}
            </span>
          </label>

          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
              disabled={uploading}
            >
              {dict.removeOption}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <span role="alert" className="text-xs text-accent">
          {error}
        </span>
      )}
    </div>
  );
}
