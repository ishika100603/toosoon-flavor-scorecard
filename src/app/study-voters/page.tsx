import Link from 'next/link'
import { redirect } from 'next/navigation'

import AppHeader from '@/components/app-header'
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

  const supabase = await createClient({ readOnly: true })
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase.rpc('study_voter_check', { p_min_votes: 30, p_fast_ms: fast, p_same_share: same || 2 })
  const r = data as Check | null

  const chip = (on: boolean) =>
    `rounded-lg px-2.5 py-1 text-sm ${on ? 'bg-[rgb(var(--primary))] text-[rgb(var(--on-primary))]' : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--ink))]'}`
  const box =
    'mt-3 overflow-x-auto rounded-xl border border-[rgb(var(--gloss)/0.6)] bg-[rgb(var(--panel)/0.6)] dark:border-[rgb(var(--gloss)/0.15)] dark:bg-[rgb(var(--panel)/0.1)]'
  const th = 'px-4 py-2 font-medium'
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
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-[rgb(var(--muted))]">
          <li>Humor-study voters with 30+ votes are checked for speed (and answers, if switched on).</li>
          <li>
            <b>Too fast:</b> their typical vote takes under {secs(fast)}, too quick to read the caption.
          </li>
          {same ? (
            <li>
              <b>Same answer (optional):</b> {Math.round(same * 100)}%+ of their votes are one answer. Off by default, since liking or
              disliking everything can be a real taste.
            </li>
          ) : null}
          <li>
            <b>Shared session:</b> the same browser session also voted from another account, a sign of one person using several
            accounts.
          </li>
          <li>👍 rate here = share of study votes that were &quot;funny&quot; or &quot;very funny&quot;.</li>
        </ul>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs font-medium text-[rgb(var(--muted))]">Too fast under</span>
            {FAST.map((f) => (
              <Link key={f} href={`/study-voters?fast=${f}&same=${same}`} className={chip(f === fast)}>
                {secs(f)}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs font-medium text-[rgb(var(--muted))]">Also flag same answer</span>
            {SAME.map((s) => (
              <Link key={s} href={`/study-voters?fast=${fast}&same=${s}`} className={chip(s === same)}>
                {s ? `${Math.round(s * 100)}%+` : 'Off'}
              </Link>
            ))}
          </div>
        </div>

        {error ? (
          <p className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            Couldn&apos;t run the check: {error.message}
          </p>
        ) : r ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                [`${fmtNumber(r.flagged)} of ${fmtNumber(r.judged)}`, 'voters flagged'],
                [pct(r.votes_total ? r.votes_flagged / r.votes_total : null), `of study votes (${fmtNumber(r.votes_flagged)}) come from them`],
                same
                  ? [fmtNumber(r.voters.filter((v) => v.too_fast && v.same_answer).length), 'voters are both too fast and same answer']
                  : [fmtNumber(r.shared), 'accounts share a browser session with another account'],
              ].map(([n, label]) => (
                <div key={label} className="rounded-xl border border-[rgb(var(--gloss)/0.6)] bg-[rgb(var(--panel)/0.6)] p-4 dark:border-[rgb(var(--gloss)/0.15)] dark:bg-[rgb(var(--panel)/0.1)]">
                  <p className="text-2xl font-semibold tabular-nums">{n}</p>
                  <p className="text-xs text-[rgb(var(--muted))]">{label}</p>
                </div>
              ))}
            </div>

            <h2 className="mt-8 text-lg font-semibold">How they change each flavor</h2>
            <p className="text-sm text-[rgb(var(--muted))]">Flavors with 200+ study votes, biggest change first.</p>
            <div className={box}>
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-[rgb(var(--gloss)/0.6)] text-xs text-[rgb(var(--muted))] dark:border-[rgb(var(--gloss)/0.15)]">
                  <tr>
                    <th className={th}>Flavor</th>
                    <th className={th}>👍 rate, all voters</th>
                    <th className={th}>Without flagged</th>
                    <th className={th}>Change</th>
                    <th className={th}>Votes kept</th>
                  </tr>
                </thead>
                <tbody>
                  {r.flavors.map((f) => {
                    const change = f.clean_rate == null ? null : Math.round((Number(f.clean_rate) - Number(f.rate)) * 100)
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
                          {change == null ? '–' : `${change > 0 ? '+' : ''}${change} pts`}
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

            <h2 className="mt-8 text-lg font-semibold">Flagged voters</h2>
            <p className="text-sm text-[rgb(var(--muted))]">
              Shown by the start of their ID. Most votes first.
              {r.voters.length > SHOWN ? ` Top ${SHOWN} of ${fmtNumber(r.voters.length)}.` : ''}
            </p>
            <div className={box}>
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-[rgb(var(--gloss)/0.6)] text-xs text-[rgb(var(--muted))] dark:border-[rgb(var(--gloss)/0.15)]">
                  <tr>
                    <th className={th}>Voter</th>
                    <th className={th}>Votes</th>
                    <th className={th}>Studies</th>
                    <th className={th}>Typical time per vote</th>
                    <th className={th}>Most common answer</th>
                    <th className={th}>Why</th>
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
                      <td className="px-4 py-2.5 text-xs">{[v.too_fast && 'Too fast', v.same_answer && 'Same answer', v.shared_session && 'Shared session'].filter(Boolean).join(' + ')}</td>
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
