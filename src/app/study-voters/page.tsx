import Link from 'next/link'
import { redirect } from 'next/navigation'

import AppHeader from '@/components/app-header'
import InfoTip from '@/components/scorecard/info-tip'
import { fmtNumber, pct } from '@/components/scorecard/scorecard-utils'
import { pageMetadata } from '@/utils/page-metadata'
import { createClient } from '@/utils/supabase/server'

export const metadata = pageMetadata('Suspicious study voters')

type Voter = {
  id: string
  votes: number
  median_ms: number | null
  top_answer: string
  top_share: number
  studies: number
  too_fast: boolean
  same_answer: boolean
  shared_session: boolean
  rushes: boolean
  rushed_share: number | null
}
type Flavor = { flavor_id: number; slug: string; votes: number; clean_votes: number; rate: number; clean_rate: number | null }
type Check = {
  judged: number
  shared: number
  too_few: number
  flagged: number
  votes_total: number
  votes_flagged: number
  voters: Voter[]
  flavors: Flavor[]
}

const FAST = [500, 1000, 2000]
// 0 = off. Liking (or hating) everything can be a real taste, so it's off by default
const SAME = [0, 0.95, 1]
const RUSH = [0, 0.2, 0.3]
const SHOWN = 50

const secs = (ms: number | null) => (ms == null ? '–' : `${(ms / 1000).toFixed(1)}s`)

// Humor-study voters whose answers look careless or gamed, and what they do to each flavor's result
export default async function StudyVotersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const fast = FAST.includes(Number(params.fast)) ? Number(params.fast) : 1000
  const same = SAME.includes(Number(params.same)) ? Number(params.same) : 0
  const rush = RUSH.includes(Number(params.rush)) ? Number(params.rush) : 0.2

  const supabase = await createClient({ readOnly: true })
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase.rpc('study_voter_check', { p_min_votes: 30, p_fast_ms: fast, p_same_share: same || 2, p_rush_share: rush })
  const r = data as Check | null

  const group = 'inline-flex rounded-lg border border-[rgb(var(--gloss)/0.8)] bg-[rgb(var(--panel)/0.6)] p-0.5 dark:border-[rgb(var(--gloss)/0.2)]'
  const chip = (on: boolean) =>
    `rounded-md px-2.5 py-1 text-sm ${on ? 'bg-[rgb(var(--primary))] text-[rgb(var(--on-primary))]' : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--ink))]'}`
  const label = 'mr-2 text-xs text-[rgb(var(--muted))]'
  const href = (q: { fast?: number; same?: number; rush?: number }) =>
    `/study-voters?fast=${q.fast ?? fast}&same=${q.same ?? same}&rush=${q.rush ?? rush}`
  const box =
    'mt-3 overflow-x-auto rounded-xl border border-[rgb(var(--gloss)/0.6)] bg-[rgb(var(--panel)/0.6)] dark:border-[rgb(var(--gloss)/0.15)] dark:bg-[rgb(var(--panel)/0.1)]'
  const th = 'whitespace-nowrap px-4 py-2 font-medium'
  const td = 'px-4 py-2.5 tabular-nums'
  const row = 'border-b border-[rgb(var(--gloss)/0.4)] last:border-0 dark:border-[rgb(var(--gloss)/0.1)]'

  return (
    <main className="relative flex min-h-screen flex-col">
      <AppHeader />
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">Suspicious study voters</h1>
          <Link href="/flavor-scorecard" className="text-sm text-[rgb(var(--accent-strong))] hover:underline">
            ← Flavor scorecard
          </Link>
        </div>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          Finds humor-study voters whose votes look careless, and shows how much they change each flavor&apos;s result. Voters with 30+
          study votes are checked.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="text-xs font-semibold text-[rgb(var(--muted))]">Flag a voter when:</span>
          <div className="flex items-center">
            <span className={label}>
              Typical vote is under
              <InfoTip text="Too fast: half of this voter's votes take less than this. Nobody can read a caption and judge it that quickly." />
            </span>
            <span className={group}>
              {FAST.map((f) => (
                <Link key={f} href={href({ fast: f })} className={chip(f === fast)}>
                  {secs(f)}
                </Link>
              ))}
            </span>
          </div>
          <div className="flex items-center">
            <span className={label}>
              Rushed votes are
              <InfoTip
                text={`Rushes sometimes: the voter normally takes ${secs(fast * 2)} or more, but this share of their votes took under ${secs(fast)}. Catches people who read most of the time but race through part of a study.`}
              />
            </span>
            <span className={group}>
              {RUSH.map((x) => (
                <Link key={x} href={href({ rush: x })} className={chip(x === rush)}>
                  {x ? `${Math.round(x * 100)}%+` : 'Off'}
                </Link>
              ))}
            </span>
          </div>
          <div className="flex items-center">
            <span className={label}>
              Same answer on
              <InfoTip text="Off by default: liking or disliking almost everything can be a real taste, so this alone isn't proof of cheating." />
            </span>
            <span className={group}>
              {SAME.map((x) => (
                <Link key={x} href={href({ same: x })} className={chip(x === same)}>
                  {x ? `${Math.round(x * 100)}%+` : 'Off'}
                </Link>
              ))}
            </span>
          </div>
        </div>
        <p className="mt-2 text-xs text-[rgb(var(--muted))]">
          Always flagged: accounts that voted from the same browser session as another account.
        </p>

        {error ? (
          <p className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            Couldn&apos;t run the check: {error.message}
          </p>
        ) : r ? (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                [`${fmtNumber(r.flagged)} voters`, `flagged, out of ${fmtNumber(r.judged)} checked`],
                [pct(r.votes_total ? r.votes_flagged / r.votes_total : null), `of all study votes (${fmtNumber(r.votes_flagged)}) were cast by them`],
                [`${fmtNumber(r.shared)} accounts`, 'voted from the same browser session as another account'],
              ].map(([n, sub]) => (
                <div key={sub} className="rounded-xl border border-[rgb(var(--gloss)/0.6)] bg-[rgb(var(--panel)/0.6)] p-4 dark:border-[rgb(var(--gloss)/0.15)] dark:bg-[rgb(var(--panel)/0.1)]">
                  <p className="text-2xl font-semibold tabular-nums">{n}</p>
                  <p className="text-xs text-[rgb(var(--muted))]">{sub}</p>
                </div>
              ))}
            </div>

            <h2 className="mt-8 text-lg font-semibold">
              How each flavor&apos;s 👍 rate changes when flagged voters are removed
              <InfoTip text="👍 rate = share of study votes that were &quot;funny&quot; or &quot;very funny&quot;. Before counts every voter; after leaves out the flagged ones. Change is in percentage points: 35% → 29% is −6 points. A rate can go up when the flagged voters had been disliking that flavor. Flavors with 200+ study votes, biggest change first." />
            </h2>
            <div className={box}>
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-[rgb(var(--gloss)/0.6)] text-xs text-[rgb(var(--muted))] dark:border-[rgb(var(--gloss)/0.15)]">
                  <tr>
                    <th className={th}>Flavor</th>
                    <th className={th}>👍 rate before</th>
                    <th className={th}>👍 rate after removing flagged voters</th>
                    <th className={th}>Change</th>
                    <th className={th}>Votes kept</th>
                  </tr>
                </thead>
                <tbody>
                  {r.flavors.map((f) => {
                    // Difference of the two rounded rates shown, so 56% → 57% reads +1
                    const change = f.clean_rate == null ? null : Math.round(Number(f.clean_rate) * 100) - Math.round(Number(f.rate) * 100)
                    return (
                      <tr key={f.flavor_id} className={row}>
                        <td className="px-4 py-2.5">
                          <Link href={`/humor-flavor/${f.flavor_id}`} className="font-medium hover:text-[rgb(var(--accent-strong))] hover:underline">
                            {f.slug}
                          </Link>
                        </td>
                        <td className={td}>{pct(f.rate)}</td>
                        <td className={`${td} font-semibold`}>{pct(f.clean_rate)}</td>
                        <td className={`${td} ${change && change < 0 ? 'text-red-700 dark:text-red-300' : change && change > 0 ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>
                          {change == null ? '–' : `${change > 0 ? '+' : ''}${change} points`}
                        </td>
                        <td className={`${td} text-[rgb(var(--muted))]`}>
                          {fmtNumber(f.clean_votes)} of {fmtNumber(f.votes)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <h2 className="mt-8 text-lg font-semibold">Who was flagged, and why</h2>
            <p className="text-sm text-[rgb(var(--muted))]">
              Voters are shown by the start of their ID. Most votes first.
              {r.voters.length > SHOWN ? ` Top ${SHOWN} of ${fmtNumber(r.voters.length)}.` : ''}
            </p>
            <div className={box}>
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-[rgb(var(--gloss)/0.6)] text-xs text-[rgb(var(--muted))] dark:border-[rgb(var(--gloss)/0.15)]">
                  <tr>
                    <th className={th}>Voter ID</th>
                    <th className={th}>Study votes</th>
                    <th className={th}>Studies</th>
                    <th className={th}>Typical time per vote</th>
                    <th className={th}>Most common answer</th>
                    <th className={th}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {r.voters.slice(0, SHOWN).map((v) => (
                    <tr key={v.id} className={row}>
                      <td className="px-4 py-2.5 font-mono text-xs">{v.id}</td>
                      <td className={td}>{fmtNumber(v.votes)}</td>
                      <td className={td}>{fmtNumber(v.studies)}</td>
                      <td className={`${td} ${v.too_fast ? 'font-semibold text-red-700 dark:text-red-300' : ''}`}>{secs(v.median_ms)}</td>
                      <td className={`px-4 py-2.5 ${v.same_answer ? 'font-semibold text-red-700 dark:text-red-300' : ''}`}>
                        {v.top_answer} ({pct(v.top_share)})
                      </td>
                      <td className="px-4 py-2.5 text-xs">{[
                          v.too_fast && 'Too fast',
                          v.rushes && `Rushes sometimes (${pct(v.rushed_share)} under ${secs(fast)})`,
                          v.same_answer && 'Same answer',
                          v.shared_session && 'Shared session',
                        ]
                          .filter(Boolean)
                          .join(' + ')}</td>
                    </tr>
                  ))}
                  {!r.voters.length ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-[rgb(var(--muted))]">
                        No voter breaks these rules.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-[rgb(var(--muted))]">{fmtNumber(r.too_few)} voters have under 30 study votes and are not checked.</p>
          </>
        ) : null}
      </div>
    </main>
  )
}
