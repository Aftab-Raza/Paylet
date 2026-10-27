import { createContext, useContext } from "react";

export type SuccessToastOptions = { position?: "top-right" | "bottom-right" };
export const SuccessToastContext = createContext<((message: string, options?: SuccessToastOptions) => void) | null>(null);
export function useSuccessToast() {
  const notify = useContext(SuccessToastContext);
  if (!notify) throw new Error("Success notifications require SuccessToastProvider.");
  return notify;
}
