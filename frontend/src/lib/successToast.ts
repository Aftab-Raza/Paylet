import { createContext, useContext } from "react";

export const SuccessToastContext = createContext<((message: string) => void) | null>(null);
export function useSuccessToast() {
  const notify = useContext(SuccessToastContext);
  if (!notify) throw new Error("Success notifications require SuccessToastProvider.");
  return notify;
}
