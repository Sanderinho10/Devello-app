"use client";

import { useEffect, useRef } from "react";

/**
 * Popup bygget på <dialog>.
 *
 * Det native elementet gir Esc, fokusfelle og inert bakgrunn uten at vi må
 * skrive det selv — og de tre tingene er nettopp det hjemmesnekrede modaler
 * pleier å mangle.
 */
export function Modal({
  open,
  onClose,
  title,
  size = "normal",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** «wide» for innhold som skal leses, som en e-posttekst. */
  size?: "normal" | "wide";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal${size === "wide" ? " wide" : ""}`}
      // Esc lukker <dialog> selv; cancel holder React-tilstanden i takt.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Klikk på ::backdrop treffer selve dialogen, ikke innholdet i den.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="modal-body">
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="button ghost"
            onClick={onClose}
            aria-label="Lukk"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
