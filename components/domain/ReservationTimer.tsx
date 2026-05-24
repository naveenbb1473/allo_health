"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ReservationTimerProps {
  expiresAt: string; // ISO string
}

function getSecondsLeft(expiresAt: string): number {
  return Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function ReservationTimer({ expiresAt }: ReservationTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    getSecondsLeft(expiresAt),
  );

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const interval = setInterval(() => {
      setSecondsLeft(getSecondsLeft(expiresAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, secondsLeft]);

  const isExpired = secondsLeft === 0;
  const isCritical = secondsLeft <= 30;
  const isWarning = secondsLeft <= 120;

  const variant = isExpired
    ? "danger"
    : isCritical
      ? "danger"
      : isWarning
        ? "warning"
        : "info";
  const label = isExpired ? "Expired" : `Expires in ${formatTime(secondsLeft)}`;

  return (
    <Badge
      variant={variant}
      aria-live="polite"
      aria-label={label}
      className={cn(isCritical && !isExpired && "animate-pulse")}
    >
      {label}
    </Badge>
  );
}
