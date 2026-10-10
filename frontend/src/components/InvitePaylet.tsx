import { useRef, useState } from "react";
import { Check, Copy, Link, Share2, UserPlus } from "lucide-react";
import Modal from "./Modal";

export default function InvitePaylet({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inviteUrl = new URL("/?join=paylet", window.location.origin).href;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setMessage("Invitation link copied.");
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setMessage("Copy the selected link to share your invitation.");
    }
  }

  async function shareLink() {
    try {
      await navigator.share({ title: "Join me on Paylet", text: "Join me on Paylet to keep track of everyday expenses.", url: inviteUrl });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessage("Sharing is unavailable. You can copy the link instead.");
      }
    }
  }

  return (
    <Modal title="Invite to Paylet" onClose={onClose}>
      <div className="invite-intro"><span className="action-symbol purple"><UserPlus size={28} /></span>
        <h3>Better with your people.</h3>
        <p>Send a friend a link to create their own Paylet account.</p>
      </div>
      <label htmlFor="paylet-invite-link"><Link size={16} /> Invitation link</label>
      <input ref={inputRef} id="paylet-invite-link" value={inviteUrl} readOnly onFocus={(event) => event.target.select()} />
      <p className="invite-privacy">Your expenses stay private. This link does not add anyone to a group.</p>
      <div className="profile-actions">
        <button className="button button-primary" onClick={() => void copyLink()}>{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? "Copied" : "Copy invite link"}</button>
        {typeof navigator.share === "function" && <button className="button button-purple" onClick={() => void shareLink()}><Share2 size={18} /> Share</button>}
      </div>
      {message && <p className="share-status" role="status">{message}</p>}
    </Modal>
  );
}
