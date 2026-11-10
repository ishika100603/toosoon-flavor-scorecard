// Thumbs-up rate as a bar, with a tick at the all-flavor average for comparison
export default function RateBar({ rate, average }: { rate: number | null; average?: number | null }) {
  const value = rate == null ? 0 : Math.round(Number(rate) * 100)
  return (
    <span className="relative block h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--muted)/0.2)]">
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-[rgb(var(--primary))]"
        style={{ width: `${value}%` }}
      />
      {average != null ? (
        <span
          className="absolute inset-y-[-2px] w-0.5 bg-[rgb(var(--ink))]"
          style={{ left: `${Math.round(Number(average) * 100)}%` }}
          title={`All-flavor average: ${Math.round(Number(average) * 100)}%`}
        />
      ) : null}
    </span>
  )
}
