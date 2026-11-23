"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/**
 * Tekstfelt som vokser med teksten.
 *
 * Et vanlig <textarea> kan dras større i hjørnet — og på et skjema i én
 * kolonne kan det dras ut over kanten av kortet, og da er feltet borte.
 * Dette har ingen hank: høyden følger innholdet, så hele teksten alltid
 * står synlig og feltet aldri blir bredere enn rammen sin.
 */
export function AutoTextarea({
  minHeight = 76,
  feltRef,
  className = "textarea",
  style,
  ...props
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
  minHeight?: number;
  /** Feltet selv, for den som trenger markøren (snippets). */
  feltRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const egen = useRef<HTMLTextAreaElement>(null);
  const ref = feltRef ?? egen;

  const maal = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight er uten kantlinja; uten den ville feltet rulle én piksel.
    const kant = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.max(minHeight, el.scrollHeight + kant)}px`;
  }, [ref, minHeight]);

  useLayoutEffect(maal, [maal, props.value]);

  // Bredden endrer seg (vindu, popup som åpnes): linjene brytes annerledes.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let bredde = el.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth === bredde) return;
      bredde = el.offsetWidth;
      maal();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, maal]);

  return <textarea ref={ref} className={`${className} auto-textarea`} style={{ minHeight, ...style }} {...props} />;
}
