import { FileBraces } from 'lucide-react';
import { useEffect, useState } from 'react';

const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

/** Accepts JSON files dropped anywhere on the page (FR-1.2) and shows an overlay while dragging. */
export function FileDrop({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      onFiles([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [onFiles]);

  if (!dragging) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-page/85 p-6 backdrop-blur-sm">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-ink-3 bg-surface px-10 py-12 text-center">
        <FileBraces aria-hidden className="size-10 text-ink-2" />
        <p className="text-lg font-semibold">JSON-Dateien hier ablegen</p>
        <p className="text-sm text-ink-2">
          Die Dateien werden nur in deinem Browser ausgewertet und nicht hochgeladen.
        </p>
      </div>
    </div>
  );
}
