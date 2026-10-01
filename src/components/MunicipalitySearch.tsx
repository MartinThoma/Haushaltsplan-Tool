import { Mail, Search } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { searchMunicipalities, yearRange, type Municipality } from '../lib/catalog.ts';
import { BUNDESLAENDER } from '../lib/kommunen.ts';

const MAX_RESULTS = 8;
const CONTACT_MAIL = 'info@martin-thoma.de';
export const CONTACT_HREF = `mailto:${CONTACT_MAIL}?subject=${encodeURIComponent('Haushaltsplan-Tool')}`;

export function ContributeHint({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-xs text-ink-2">
        Deine Kommune fehlt?{' '}
        <a
          href={CONTACT_HREF}
          className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
        >
          Haushaltsplan einsenden
        </a>
      </p>
    );
  }
  return (
    <div role="note" className="rounded-lg border border-focus/40 bg-focus/8 p-3.5 text-sm text-ink">
      <p className="font-semibold">Deine Kommune ist noch nicht dabei?</p>
      <p className="mt-1 text-ink-2">
        Du kannst neue Haushaltsdaten unterstützen! Sende einfach eine E-Mail an{' '}
        <a href={CONTACT_HREF} className="font-medium text-ink underline underline-offset-2">
          {CONTACT_MAIL}
        </a>{' '}
        mit dem Betreff „Haushaltsplan-Tool“ und einem Link oder Anhang zum Haushaltsplan deiner Kommune.
      </p>
      <a
        href={CONTACT_HREF}
        className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-medium text-surface hover:opacity-90"
      >
        <Mail aria-hidden className="size-4" />
        E-Mail schreiben
      </a>
    </div>
  );
}

interface Props {
  label: string;
  municipalities: readonly Municipality[];
  value: Municipality | undefined;
  onSelect: (municipality: Municipality) => void;
}

/** Combobox with instant search over municipality names and postal codes. */
export function MunicipalitySearch({ label, municipalities, value, onSelect }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const open = query !== null;

  const results = useMemo(
    () => (open ? searchMunicipalities(municipalities, query).slice(0, MAX_RESULTS) : []),
    [open, municipalities, query],
  );
  const selectable = results.filter((m) => m.entries.length > 0);

  function close() {
    setQuery(null);
    setActive(0);
  }

  function choose(municipality: Municipality) {
    if (municipality.entries.length === 0) return;
    onSelect(municipality);
    close();
    inputRef.current?.blur();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (event.key === 'ArrowDown') setQuery('');
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (selectable.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + selectable.length) % selectable.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = selectable[active];
      if (target) choose(target);
    } else if (event.key === 'Escape') {
      close();
    }
  }

  const activeId = open && selectable[active] ? `${id}-${selectable[active].ags}` : undefined;

  return (
    <div className="relative flex min-w-0 flex-col gap-1">
      <label htmlFor={`${id}-input`} className="text-xs font-medium text-ink-3">
        {label}
      </label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-ink-3" />
        <input
          ref={inputRef}
          id={`${id}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          spellCheck={false}
          placeholder="Name oder PLZ"
          value={query ?? value?.name ?? ''}
          onFocus={(e) => {
            setQuery('');
            e.target.select();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onBlur={close}
          onKeyDown={onKeyDown}
          className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-8 text-sm text-ink placeholder:text-ink-3 hover:border-line-strong"
        />
      </div>

      {open && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 min-w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          <ul id={listId} role="listbox" aria-label={label} className="max-h-80 overflow-y-auto py-1">
            {results.map((m) => {
              const disabled = m.entries.length === 0;
              const isActive = !disabled && selectable[active] === m;
              return (
                <li
                  key={m.ags}
                  id={`${id}-${m.ags}`}
                  role="option"
                  aria-selected={isActive}
                  aria-disabled={disabled}
                  // mousedown keeps the input focused, so the blur handler does not close the list first
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(m);
                  }}
                  onMouseEnter={() => !disabled && setActive(selectable.indexOf(m))}
                  className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 ${
                    isActive ? 'bg-surface-3' : ''
                  } ${disabled ? 'cursor-default opacity-60' : ''} ${m === value ? 'font-semibold' : ''}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{m.name}</span>
                    <span className="block truncate text-xs text-ink-3">
                      {[
                        m.plz.length ? `PLZ ${m.plz.join(', ')}` : null,
                        m.bundesland ? BUNDESLAENDER[m.bundesland] : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="num shrink-0 text-xs text-ink-2">
                    {disabled ? 'noch keine Daten' : yearRange(m)}
                  </span>
                </li>
              );
            })}
          </ul>
          {/* preventDefault keeps focus in the input, so the mail link survives the blur-close */}
          <div className="border-t border-line bg-surface-2 px-3 py-2.5" onMouseDown={(e) => e.preventDefault()}>
            {selectable.length === 0 ? <ContributeHint /> : <ContributeHint compact />}
          </div>
        </div>
      )}
    </div>
  );
}
