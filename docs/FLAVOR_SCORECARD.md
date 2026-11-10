# Flavor Scorecard

Semester project improvement to toosoon (Columbia, Designing for GenAI).

**Who it's for:** flavor authors on the Crackd team, who edit humor flavors in
toosoon but couldn't see how voters rated a flavor's captions.

**What it adds**

- `/flavor-scorecard`: every flavor ranked by thumbs-up rate (share of votes on
  its captions that were 👍), with vote counts, a confidence label, a
  minimum-votes filter and three sorts.
- A **Scorecard** section at the top of each flavor's page: thumbs-up rate,
  weekly trend, and the 3 best and 3 worst captions (5+ votes each) with photos.
- A "Flavor scorecard" entry in the global views menu.

**Setup**

1. Run `supabase/migrations/20261104000000_flavor_scorecard.sql` in the Supabase
   SQL editor. It adds three read-only functions; only superadmins and matrix
   admins can call them.
2. Optional email sign-in (for a course copy without Google OAuth): it is on at
   localhost, and a deployment turns it on with `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN=true`.
   The account still needs `profiles.is_matrix_admin` or `is_superadmin`.
