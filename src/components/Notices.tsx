import { CircleAlert, CircleCheck, TriangleAlert, X } from 'lucide-react';

export interface Notice {
  id: number;
  tone: 'error' | 'warning' | 'success';
  title: string;
  details?: string[];
}

const TONE = {
  error: { Icon: CircleAlert, icon: 'text-critical', frame: 'border-critical/40 bg-critical/6' },
  warning: { Icon: TriangleAlert, icon: 'text-serious', frame: 'border-serious/50 bg-serious/8' },
  success: { Icon: CircleCheck, icon: 'text-good', frame: 'border-line bg-surface' },
} as const;

const MAX_DETAILS = 25;

export function Notices({ notices, onDismiss }: { notices: Notice[]; onDismiss?: (id: number) => void }) {
  if (notices.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {notices.map((notice) => {
        const { Icon, icon, frame } = TONE[notice.tone];
        const details = notice.details ?? [];
        return (
          <div
            key={notice.id}
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={`flex gap-3 rounded-xl border p-3 text-sm ${frame}`}
          >
            <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${icon}`} />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">{notice.title}</p>
              {details.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-ink-2 [overflow-wrap:anywhere]">
                  {details.slice(0, MAX_DETAILS).map((detail, i) => (
                    <li key={i}>{detail}</li>
                  ))}
                  {details.length > MAX_DETAILS && <li>… und {details.length - MAX_DETAILS} weitere</li>}
                </ul>
              )}
            </div>
            {onDismiss && (
              <button
                type="button"
                onClick={() => onDismiss(notice.id)}
                className="-m-1 self-start rounded p-1 text-ink-3 hover:bg-surface-3 hover:text-ink"
                aria-label="Hinweis schließen"
              >
                <X aria-hidden className="size-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
