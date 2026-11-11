// A small "i" that explains a term on hover, keyboard focus or tap.
// Pure CSS, so it works in server components.
export default function InfoTip({ text, label = 'What this means' }: { text: string; label?: string }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <button
        type="button"
        aria-label={`${label}: ${text}`}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-[rgb(var(--muted)/0.6)] font-serif text-[10px] italic leading-none text-[rgb(var(--muted))] hover:border-[rgb(var(--ink))] hover:text-[rgb(var(--ink))]"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-40 mt-1.5 hidden w-60 -translate-x-1/2 rounded-md border border-[rgb(var(--gloss)/0.6)] bg-[rgb(var(--canvas))] px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-[rgb(var(--ink))] shadow-lg group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  )
}
