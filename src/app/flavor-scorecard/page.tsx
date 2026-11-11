import Link from 'next/link'
import { redirect } from 'next/navigation'

import AppHeader from '@/components/app-header'
import RateBar from '@/components/scorecard/rate-bar'
import InfoTip from '@/components/scorecard/info-tip'
import { audience, confidence, fmtDay, fmtNumber, likesChange, pct, voterRules, type ScorecardRow } from '@/components/scorecard/scorecard-utils'
import { pageMetadata } from '@/utils/page-metadata'
import { createClient } from '@/utils/supabase/server'

export const metadata = pageMetadata('Flavor scorecard')

const MIN_OPTIONS = [0, 50, 200, 1000]
const SORTS = { rate: 'All voters', clean: 'Without suspicious voters', votes: 'Most votes', recent: 'Newest' } as const

// Every flavor ranked by how real voters rated its captions.
export default async function FlavorScorecardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const min = MIN_OPTIONS.includes(Number(params.min)) ? Number(params.min) : 200
  const sort = (typeof params.sort === 'string' && params.sort in SORTS ? params.sort : 'rate') as keyof typeof SORTS
  // Same rules as the Suspicious study voters page, so both pages agree
  const rules = voterRules(params)
  const ruleQuery = `fast=${rules.fast}&rush=${rules.rush}&same=${rules.same}`

  const supabase = await createClient({ readOnly: true })
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase.rpc('flavor_scorecard', { p_fast_ms: rules.fast, p_rush_share: rules.rush, p_same_share: rules.same || 2 })
  const all = ((data ?? []) as ScorecardRow[]).map((r) => ({ ...r, votes: Number(r.votes), up: Number(r.up), up_rate: r.up_rate == null ? null : Number(r.up_rate), clean_up_rate: r.clean_up_rate == null ? null : Number(r.clean_up_rate) }))
  const totalVotes = all.reduce((n, r) => n + r.votes, 0)
  const average = totalVotes ? all.reduce((n, r) => n + r.up, 0) / totalVotes : null
  const rows = all
    .filter((r) => r.votes >= min && r.votes > 0)
    .sort((a, b) =>
      sort === 'votes'
        ? b.votes - a.votes
        : sort === 'recent'
          ? (b.last_vote ?? '').localeCompare(a.last_vote ?? '')
          : sort === 'clean'
            ? (b.clean_up_rate ?? 0) - (a.clean_up_rate ?? 0) || b.votes - a.votes
          : (b.up_rate ?? 0) - (a.up_rate ?? 0) || b.votes - a.votes
    )
  const hidden = all.filter((r) => r.votes > 0).length - rows.length
  const unvoted = all.filter((r) => r.votes === 0).length

  // Options sit inside one outlined group, so the label beside it reads as a label, not a button
  const group = 'inline-flex rounded-lg border border-[rgb(var(--gloss)/0.8)] bg-[rgb(var(--panel)/0.6)] p-0.5 dark:border-[rgb(var(--gloss)/0.2)]'
  const chip = (on: boolean) =>
    `rounded-md px-2.5 py-1 text-sm transition ${on ? 'bg-[rgb(var(--primary))] text-[rgb(var(--on-primary))]' : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--ink))]'}`
  const label = 'mr-2 text-xs text-[rgb(var(--muted))]'

  return (
    <main className="relative flex min-h-screen flex-col">
      <AppHeader />
      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">Flavor scorecard</h1>
          <Link href={`/study-voters?${ruleQuery}`} className="text-sm text-[rgb(var(--accent-strong))] hover:underline">
            Who counts as a suspicious voter →
          </Link>
        </div>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          Which humor flavors voters like most, with and without suspicious voters. Click a flavor to see its best and worst captions.
        </p>

        {error ? (
          <p className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            Couldn&apos;t load the scorecard: {error.message}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center">
            <span className={label}>
              Show flavors with at least
              <InfoTip text="Hides flavors with too few votes to judge. A flavor with 3 votes can show 100% by luck." />
            </span>
            <span className={group}>
              {MIN_OPTIONS.map((m) => (
                <Link key={m} href={`/flavor-scorecard?min=${m}&sort=${sort}&${ruleQuery}`} className={chip(m === min)}>
                  {m === 0 ? 'Any' : `${m.toLocaleString('en-US')} votes`}
                </Link>
              ))}
            </span>
          </div>
          <div className="flex items-center">
            <span className={label}>Sort by 👍 rate of</span>
            <span className={group}>
              {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((s) => (
                <Link key={s} href={`/flavor-scorecard?min=${min}&sort=${s}&${ruleQuery}`} className={chip(s === sort)}>
                  {SORTS[s]}
                </Link>
              ))}
            </span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-[rgb(var(--gloss)/0.6)] bg-[rgb(var(--panel)/0.6)] dark:border-[rgb(var(--gloss)/0.15)] dark:bg-[rgb(var(--panel)/0.1)]">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-[rgb(var(--gloss)/0.6)] text-xs text-[rgb(var(--muted))] dark:border-[rgb(var(--gloss)/0.15)]">
              <tr>
                <th className="whitespace-nowrap px-4 py-2 font-medium">#</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Flavor</th>
                <th className="w-48 whitespace-nowrap px-4 py-2 font-medium">
                  👍 rate, all voters
                  <InfoTip text={`Share of votes on this flavor's captions that were thumbs up. The black tick is the average across all flavors${average != null ? ` (${pct(average)})` : ''}.`} />
                </th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">
                  Without suspicious voters
                  <InfoTip text="The 👍 rate after leaving out votes from study voters who voted too fast, rushed part of a study, or voted from a shared browser session. 'Who counts as a suspicious voter' at the top shows them and lets you change the rules." />
                </th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Change</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Votes</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">
                  Captions voted
                  <InfoTip text="How many of the captions this flavor wrote got at least one vote. A flavor can write many more captions than people ever vote on." />
                </th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">
                  Audience
                  <InfoTip text="Do regular voters (10+ votes on this flavor) agree? Fans liked 70%+ of its captions, critics 30% or less. Divided means at least 1 in 5 regulars is a fan and 1 in 5 a critic, as when one group (say, grad students) gets the jokes and another doesn't." />
                </th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">
                  Trust
                  <InfoTip text="How many votes the rate is based on. High: 1,000+. Medium: 200–999. Low: under 200. A high rate with Medium or Low trust can be luck." />
                </th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Last vote</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const c = confidence(r.votes)
                const a = audience(r)
                const ch = likesChange(r.up_rate, r.clean_up_rate)
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
                    <td className="px-4 py-3 font-semibold tabular-nums">{pct(r.clean_up_rate)}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-xs ${ch?.className ?? ''}`}>{ch?.text ?? '–'}</td>
                    <td className="px-4 py-3 tabular-nums">{fmtNumber(r.votes)}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {fmtNumber(r.voted_captions)} <span className="text-[rgb(var(--muted))]">of {fmtNumber(r.caption_count)}</span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`font-medium ${a.className}`}>{a.label}</span>
                      {Number(r.regulars) >= 20 ? (
                        <span className="block text-[rgb(var(--muted))]">
                          {fmtNumber(r.fans)} fans · {fmtNumber(r.critics)} critics
                        </span>
                      ) : null}
                    </td>
                    <td className={`px-4 py-3 text-xs font-medium ${c.className}`}>{c.label}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[rgb(var(--muted))]">{fmtDay(r.last_vote)}</td>
                  </tr>
                )
              })}
              {!rows.length && !error ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-[rgb(var(--muted))]">
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
