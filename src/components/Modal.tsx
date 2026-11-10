"use client";

import { useEffect, useRef, useState } from "react";

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
  const bodyRef = useRef<HTMLDivElement>(null);
  // Ruller bare når innholdet er høyere enn vinduet. Ellers får nedtrekkslister
  // (kundesøk, tilbudssøk) henge utenfor popupen, som før — en innholdsdel som
  // alltid ruller, ville kuttet dem av.
  const [ruller, setRuller] = useState(false);

  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    const body = bodyRef.current;
    if (!dialog || !body) return;
    const maal = () => {
      const hode = dialog.querySelector(".modal-head")?.getBoundingClientRect().height ?? 0;
      // Samme luft som max-height i CSS-en: 32 px over og under.
      setRuller(body.scrollHeight + hode > window.innerHeight - 64);
    };
    maal();
    const observer = new ResizeObserver(maal);
    observer.observe(body);
    window.addEventListener("resize", maal);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", maal);
    };
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal${size === "wide" ? " wide" : ""}${ruller ? " ruller" : ""}`}
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
      <div className="modal-body" ref={bodyRef}>
        {children}
      </div>
    </dialog>
  );
}
