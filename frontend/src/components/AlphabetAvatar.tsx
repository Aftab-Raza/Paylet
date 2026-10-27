import type { CSSProperties } from "react";
import { alphabetAvatar } from "../lib/alphabetAvatar";

export default function AlphabetAvatar({ name }: { name: string }) {
  const { initial, color } = alphabetAvatar(name);
  return <span className="contact-avatar alphabet-avatar" style={{ "--avatar-color": color } as CSSProperties} aria-hidden="true">{initial}</span>;
}
