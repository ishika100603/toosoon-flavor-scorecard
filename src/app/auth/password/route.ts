import { NextResponse } from 'next/server'

import { createClient } from '@/utils/supabase/server'

// Email + password sign-in for a personal Supabase copy of the course data, where
// Google OAuth isn't set up. On by default on localhost; a deployment opts in with
// NEXT_PUBLIC_ENABLE_EMAIL_LOGIN=true. Same admin check as /auth/callback.
const isLocal = (url: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
const emailLoginOn = (url: URL) => isLocal(url) || process.env.NEXT_PUBLIC_ENABLE_EMAIL_LOGIN === 'true'

export async function POST(request: Request) {
  const url = new URL(request.url)
  const back = (message: string) =>
    NextResponse.redirect(`${url.origin}/login?message=${encodeURIComponent(message)}`, 303)

  if (!emailLoginOn(url)) return back('Email sign-in is turned off for this site.')

  const form = await request.formData()
  const email = String(form.get('email') ?? '').trim()
  const password = String(form.get('password') ?? '')
  if (!email || !password) return back('Enter your email and password.')

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) return back(error?.message ?? 'Unable to sign in.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superadmin,is_matrix_admin')
    .eq('id', data.user.id)
    .single<{ is_superadmin: boolean | null; is_matrix_admin: boolean | null }>()

  if (profile?.is_superadmin !== true && profile?.is_matrix_admin !== true) {
    await supabase.auth.signOut({ scope: 'local' })
    return back('Signed in, but this profile is not a matrix admin yet. Set is_matrix_admin = true and try again.')
  }

  return NextResponse.redirect(new URL('/flavor-scorecard', url.origin), 303)
}
