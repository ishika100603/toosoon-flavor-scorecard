import Link from 'next/link'

import RateBar from '@/components/scorecard/rate-bar'
import { confidence, fmtNumber, fmtWeek, pct, type ScorecardCaption, type ScorecardDetail } from '@/components/scorecard/scorecard-utils'
import { createClient } from '@/utils/supabase/server'

function CaptionList({ title, items, tone, empty = 'No caption has 5+ votes yet.' }: { title: string; items: ScorecardCaption[]; tone: 'good' | 'bad'; empty?: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-[rgb(var(--muted))]">{title}</h3>
      {items.length ? (
        <ol className="mt-2 grid gap-2">
          {items.map((c) => (
            <li key={c.id} className="flex gap-3 rounded-lg border border-[rgb(var(--gloss)/0.6)] bg-[rgb(var(--panel)/0.7)] p-2 dark:border-[rgb(var(--gloss)/0.15)] dark:bg-[rgb(var(--panel)/0.15)]">
              {c.image_url ? (
                <a href={c.image_url} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.image_url} alt="" loading="lazy" className="h-16 w-16 rounded-md object-cover" />
                </a>
              ) : null}
              <div className="min-w-0">
                <p className="text-sm leading-snug">{c.content}</p>
                <p className={`mt-1 text-xs font-medium ${tone === 'good' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                  {pct(c.up_rate)} 👍 <span className="font-normal text-[rgb(var(--muted))]">· {c.up} up, {c.down} down</span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-[rgb(var(--muted))]">{empty}</p>
      )}
    </div>
  )
}

// Weekly thumbs-up rate as bars; fainter bars rest on fewer votes
function Trend({ weekly }: { weekly: ScorecardDetail['weekly'] }) {
  if (weekly.length < 2) return null
  const maxVotes = Math.max(...weekly.map((w) => Number(w.votes)))
  return (
    <div>
      <h3 className="text-xs font-semibold text-[rgb(var(--muted))]">👍 rate by week</h3>
      <div className="mt-2 flex h-32 items-end gap-1.5" role="img" aria-label="Weekly thumbs-up rate">
        {weekly.map((w) => {
          const rate = w.up_rate == null ? 0 : Number(w.up_rate)
          return (
            <div
              key={w.week}
              className="flex h-full flex-1 flex-col items-center justify-end"
              title={`Week of ${fmtWeek(w.week)}: ${pct(rate)} of ${fmtNumber(w.votes)} votes`}
            >
              <span className="mb-1 text-[11px] tabular-nums text-[rgb(var(--muted))]">{pct(rate)}</span>
              <span
                className="w-full rounded-t bg-[rgb(var(--primary))]"
                style={{ height: `${Math.max(2, rate * 100)}%`, opacity: 0.35 + 0.65 * (Number(w.votes) / maxVotes) }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {weekly.map((w) => (
          <span key={w.week} className="flex-1 text-center text-[10px] leading-tight text-[rgb(var(--muted))]">
            {fmtWeek(w.week)}
          </span>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-[rgb(var(--muted))]">Fainter bar = fewer votes.</p>
    </div>
  )
}

// The Flavor Scorecard section on a flavor's page
export default async function FlavorScorecardPanel({ flavorId }: { flavorId: number }) {
  const supabase = await createClient({ readOnly: true })
  const [{ data, error }, captionsQ] = await Promise.all([
    supabase.rpc('flavor_scorecard_detail', { p_flavor_id: flavorId }),
    supabase.from('captions').select('id', { count: 'exact', head: true }).eq('humor_flavor_id', flavorId),
  ])
  const detail = (data ?? { best: [], worst: [], weekly: [] }) as ScorecardDetail
  const votes = detail.weekly.reduce((n, w) => n + Number(w.votes), 0)
  const up = detail.weekly.reduce((n, w) => n + Math.round(Number(w.votes) * Number(w.up_rate ?? 0)), 0)
  const rate = votes ? up / votes : null
  const c = confidence(votes)
  // With few captions the two lists overlap: a caption shows in only one, and
  // "worst" only lists captions that actually did worse than the best ones
  const bestIds = new Set(detail.best.map((b) => b.id))
  const lowestBest = Math.min(...detail.best.map((b) => Number(b.up_rate)))
  const worst = detail.worst.filter((w) => !bestIds.has(w.id) && Number(w.up_rate) < lowestBest)
  const worstEmpty = detail.best.length
    ? 'No other caption with 5+ votes did worse than the best ones.'
    : 'No caption has 5+ votes yet.'

  return (
    <section className="rounded-xl border border-[rgb(var(--primary)/0.35)] bg-[rgb(var(--panel)/0.6)] p-4 dark:border-[rgb(var(--primary)/0.25)] dark:bg-[rgb(var(--panel)/0.1)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Scorecard</h2>
        <Link href="/flavor-scorecard" className="text-sm text-[rgb(var(--accent-strong))] hover:underline">
          All flavors →
        </Link>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-[rgb(var(--muted))]">Couldn&apos;t load votes: {error.message}</p>
      ) : !votes ? (
        <p className="mt-2 text-sm text-[rgb(var(--muted))]">
          Nobody has voted on this flavor&apos;s captions yet{captionsQ.count ? ` (${fmtNumber(captionsQ.count)} captions written)` : ''}.
        </p>
      ) : (
        <div className="mt-3 grid gap-5">
          <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6">
            <div>
              <p className="text-4xl font-semibold tabular-nums">{pct(rate)}</p>
              <p className="text-xs text-[rgb(var(--muted))]">👍 rate</p>
            </div>
            <div className="grid gap-2">
              <RateBar rate={rate} />
              <p className="text-sm text-[rgb(var(--muted))]">
                {fmtNumber(votes)} votes · Trust:{' '}
                <span className={`font-medium ${c.className}`}>{c.label}</span>
              </p>
            </div>
          </div>
          <Trend weekly={detail.weekly} />
          <div className="grid gap-5 md:grid-cols-2">
            <CaptionList title="Best captions" items={detail.best} tone="good" />
            <CaptionList title="Worst captions" items={worst} tone="bad" empty={worstEmpty} />
          </div>
        </div>
      )}
    </section>
  )
}
