"use client";

import { useEffect } from "react";
import { keepTapsInScrollLocks } from "@/lib/tap-slop";

/** Keeps taps in open menus, sheets and dialogs working on iPhone (see lib/tap-slop). */
export function TapSlop() {
  useEffect(() => keepTapsInScrollLocks(), []);
  return null;
}
