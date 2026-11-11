// Shared helpers for the Flavor Scorecard (ranking page + per-flavor panel).

export type ScorecardRow = {
  flavor_id: number
  slug: string
  caption_count: number
  voted_captions: number
  votes: number
  up: number
  down: number
  up_rate: number | null
  last_vote: string | null
}

export type ScorecardCaption = {
  id: string
  content: string | null
  image_url: string | null
  votes: number
  up: number
  down: number
  up_rate: number
}

export type ScorecardDetail = {
  best: ScorecardCaption[]
  worst: ScorecardCaption[]
  weekly: { week: string; votes: number; up_rate: number | null }[]
}

// How much to trust a thumbs-up rate, by how many votes it rests on
export const confidence = (votes: number) =>
  votes >= 1000
    ? { label: 'High', className: 'text-emerald-700 dark:text-emerald-300' }
    : votes >= 200
      ? { label: 'Medium', className: 'text-amber-700 dark:text-amber-300' }
      : { label: 'Low', className: 'text-[rgb(var(--muted))]' }

export const pct = (rate: number | null | undefined) => (rate == null ? '–' : `${Math.round(Number(rate) * 100)}%`)

export const fmtNumber = (n: number | null | undefined) => (n == null ? '–' : Number(n).toLocaleString('en-US'))

export const fmtDay = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))
    : '–'

// Weeks come back as UTC midnight; show them in UTC so the date doesn't slip a day
export const fmtWeek = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(iso))
