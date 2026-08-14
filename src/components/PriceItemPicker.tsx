"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatNok, type PriceListItem } from "@/lib/types";

/**
 * Søkbar veljar for prisrader.
 *
 * Ein vanleg nedtrekk held så lenge prisfila er kort, men Star Elektro sin
 * ekte prisfil vil ha hundrevis av rader — då må ein kunne skrive seg fram.
 * Søket matchar på namn, kode og skildring, og krev at alle orda i søket
 * finst: «stikk dobbel» treffer «Montering stikkontakt, dobbel».
 */
export function PriceItemPicker({
  items,
  onSelect,
  placeholder = "Legg til post frå prisfila…",
}: {
  items: PriceListItem[];
  onSelect: (item: PriceListItem) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => filterItems(items, query), [items, query]);
  const visible = matches.slice(0, MAX_VISIBLE);

  // Hald markeringa innanfor lista når søket endrar seg.
  useEffect(() => {
    setHighlight(0);
  }, [query]);

  // Rull den markerte raden inn i synsfeltet ved tastaturnavigasjon.
  useEffect(() => {
    if (!open) return;
    const el = document.getElementById(`${listId}-${highlight}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open, listId]);

  function choose(item: PriceListItem) {
    onSelect(item);
    setQuery("");
    setOpen(false);
    // Behald fokus, så ein kan leggje til fleire postar etter kvarandre.
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((current) => Math.min(current + 1, visible.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      if (open && visible[highlight]) {
        event.preventDefault();
        choose(visible[highlight]);
      }
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div
      className="picker"
      onBlur={(event) => {
        // Lukk berre når fokus faktisk forlèt heile veljaren.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <input
        ref={inputRef}
        className="input picker-input"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && visible.length ? `${listId}-${highlight}` : undefined}
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {open && (
        <div className="picker-panel" id={listId} role="listbox">
          {visible.length === 0 ? (
            <div className="picker-empty">
              Ingen prisrader matchar «{query}».
            </div>
          ) : (
            <>
              {visible.map((item, index) => (
                <button
                  key={item.id}
                  id={`${listId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === highlight}
                  className={`picker-option${index === highlight ? " active" : ""}`}
                  // mousedown i staden for click: click kjem etter blur, og
                  // då er panelet allereie lukka.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(item);
                  }}
                  onMouseEnter={() => setHighlight(index)}
                >
                  <span className="picker-name">
                    {item.name}
                    {item.code && <span className="picker-code">{item.code}</span>}
                  </span>
                  <span className="picker-price">
                    {formatNok(Number(item.unit_price))}
                    <span className="picker-unit"> / {item.unit}</span>
                  </span>
                  {item.description && (
                    <span className="picker-description">{item.description}</span>
                  )}
                </button>
              ))}

              {matches.length > visible.length && (
                <div className="picker-empty">
                  Viser {visible.length} av {matches.length}. Skriv meir for å snevre inn.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const MAX_VISIBLE = 40;

function filterItems(items: PriceListItem[], query: string): PriceListItem[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return items;

  return items.filter((item) => {
    const haystack = [item.name, item.code, item.description]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}
