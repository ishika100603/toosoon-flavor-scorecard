import Link from 'next/link'
import { redirect } from 'next/navigation'

import AppHeader from '@/components/app-header'
import RateBar from '@/components/scorecard/rate-bar'
import { confidence, fmtDay, fmtNumber, pct, type ScorecardRow } from '@/components/scorecard/scorecard-utils'
import { pageMetadata } from '@/utils/page-metadata'
import { createClient } from '@/utils/supabase/server'

export const metadata = pageMetadata('Flavor scorecard')

const MIN_OPTIONS = [0, 50, 200, 1000]
const SORTS = { rate: '👍 rate', votes: 'Most votes', recent: 'Newest' } as const

// Every flavor ranked by how real voters rated its captions.
export default async function FlavorScorecardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const min = MIN_OPTIONS.includes(Number(params.min)) ? Number(params.min) : 200
  const sort = (typeof params.sort === 'string' && params.sort in SORTS ? params.sort : 'rate') as keyof typeof SORTS

  const supabase = await createClient({ readOnly: true })
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase.rpc('flavor_scorecard')
  const all = ((data ?? []) as ScorecardRow[]).map((r) => ({ ...r, votes: Number(r.votes), up: Number(r.up), up_rate: r.up_rate == null ? null : Number(r.up_rate) }))
  const totalVotes = all.reduce((n, r) => n + r.votes, 0)
  const average = totalVotes ? all.reduce((n, r) => n + r.up, 0) / totalVotes : null
  const rows = all
    .filter((r) => r.votes >= min && r.votes > 0)
    .sort((a, b) =>
      sort === 'votes'
        ? b.votes - a.votes
        : sort === 'recent'
          ? (b.last_vote ?? '').localeCompare(a.last_vote ?? '')
          : (b.up_rate ?? 0) - (a.up_rate ?? 0) || b.votes - a.votes
    )
  const hidden = all.filter((r) => r.votes > 0).length - rows.length
  const unvoted = all.filter((r) => r.votes === 0).length

  const chip = (on: boolean) =>
    `rounded-lg px-2.5 py-1 text-sm transition ${on ? 'bg-[rgb(var(--primary))] text-[rgb(var(--on-primary))]' : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--ink))]'}`

  return (
    <main className="relative flex min-h-screen flex-col">
      <AppHeader />
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">Flavor scorecard</h1>
          <Link href="/study-voters" className="text-sm text-[rgb(var(--accent-strong))] hover:underline">
            Suspicious study voters →
          </Link>
        </div>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-[rgb(var(--muted))]">
          <li>Which humor flavors voters like most.</li>
          <li>👍 rate = share of votes that were thumbs up.{average != null ? ` Average: ${pct(average)} (black tick).` : ''}</li>
          <li>
            Trust = how many votes the rate is based on: <b>High</b> 1,000+, <b>Medium</b> 200–999, <b>Low</b> under 200. A high rate
            with Medium or Low trust can be luck.
          </li>
          <li>Click a flavor to see its best and worst captions.</li>
        </ul>

        {error ? (
          <p className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            Couldn&apos;t load the scorecard: {error.message}. If it says the function doesn&apos;t exist, run
            supabase/migrations/20261104000000_flavor_scorecard.sql in the Supabase SQL editor.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs font-medium text-[rgb(var(--muted))]">Min. votes</span>
            {MIN_OPTIONS.map((m) => (
              <Link key={m} href={`/flavor-scorecard?min=${m}&sort=${sort}`} className={chip(m === min)}>
                {m === 0 ? 'Any' : m.toLocaleString('en-US')}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs font-medium text-[rgb(var(--muted))]">Sort by</span>
            {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((s) => (
              <Link key={s} href={`/flavor-scorecard?min=${min}&sort=${s}`} className={chip(s === sort)}>
                {SORTS[s]}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-[rgb(var(--gloss)/0.6)] bg-[rgb(var(--panel)/0.6)] dark:border-[rgb(var(--gloss)/0.15)] dark:bg-[rgb(var(--panel)/0.1)]">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="border-b border-[rgb(var(--gloss)/0.6)] text-xs text-[rgb(var(--muted))] dark:border-[rgb(var(--gloss)/0.15)]">
              <tr>
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">Flavor</th>
                <th className="w-48 px-4 py-2 font-medium">👍 rate</th>
                <th className="px-4 py-2 font-medium">Votes</th>
                <th className="px-4 py-2 font-medium" title="High: 1,000+ votes · Medium: 200–999 · Low: under 200">Trust</th>
                <th className="px-4 py-2 font-medium">Last vote</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const c = confidence(r.votes)
                return (
                  <tr key={r.flavor_id} className="border-b border-[rgb(var(--gloss)/0.4)] last:border-0 dark:border-[rgb(var(--gloss)/0.1)]">
                    <td className="px-4 py-3 tabular-nums text-[rgb(var(--muted))]">{i + 1}</td>
                    <td className="px-4 py-3">
                      <Link href={`/humor-flavor/${r.flavor_id}`} className="font-medium hover:text-[rgb(var(--accent-strong))] hover:underline">
                        {r.slug}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className="w-10 text-right font-semibold tabular-nums">{pct(r.up_rate)}</span>
                        <RateBar rate={r.up_rate} average={average} />
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{fmtNumber(r.votes)}</td>
                    <td className={`px-4 py-3 text-xs font-medium ${c.className}`}>{c.label}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[rgb(var(--muted))]">{fmtDay(r.last_vote)}</td>
                  </tr>
                )
              })}
              {!rows.length && !error ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[rgb(var(--muted))]">
                    No flavor has that many votes. Try a lower minimum.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-[rgb(var(--muted))]">
          {rows.length} flavors shown{hidden > 0 ? ` · ${hidden} with fewer votes hidden` : ''}
        </p>
      </div>
    </main>
  )
}
