import { useEffect } from "react";
import { startMotionSync } from "./store";

/**
 * Connects the motion store to the OS preference and the `<html data-motion>` attribute for the
 * lifetime of the app shell. Renders nothing; the effect's cleanup removes every listener.
 */
export function MotionSync() {
  useEffect(() => startMotionSync(), []);
  return null;
}
