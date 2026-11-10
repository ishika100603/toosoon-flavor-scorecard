This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Use Node.js 24 before installing dependencies or running the app. If you use `nvm`, run:

```bash
nvm use
```

Then install dependencies and start the development server:

```bash
npm install
```

```bash
npm run dev
```

Open [http://localhost:3003](http://localhost:3003) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.


## Deploy on AWS

This app is deployed with AWS Amplify Hosting through a console-managed GitHub
App connection. Amplify uses the committed `amplify.yml` build spec.

Applications:

- Staging: `toosoon-staging`, connected to the `staging` branch and served
  from `https://matrix.almostcrackd.ai`
- Production: `toosoon-production`, connected to the `main` branch and served
  from `https://matrix.crackd.ai`

One-time setup:

1. Install the Amplify GitHub App for `us-east-1` and grant it access to
   `The-Humor-Project/toosoon`:
   `https://github.com/apps/aws-amplify-us-east-1/installations/new`
2. In the AWS Amplify console, choose **New app** -> **Host web app**.
3. Choose **GitHub** and select `The-Humor-Project/toosoon`.
4. Create the staging app with app name `toosoon-staging` and branch
   `staging`.
5. Create the production app with app name `toosoon-production` and branch
   `main`.
6. Confirm Amplify uses the committed root `amplify.yml` build spec.
7. Add the custom domains in the Amplify console:
   - `matrix.almostcrackd.ai` -> staging branch
   - `matrix.crackd.ai` -> production branch

Required Amplify environment variables:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `GOOGLE_AI_API_KEY`

Optional:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_ENVIRONMENT`
- `NEXT_PUBLIC_SITE_TITLE`
- `OPENAI_API_KEY`
- `X_AI_KEY`

Amplify must rebuild after environment values change. The root `amplify.yml`
writes all `NEXT_PUBLIC_*` Amplify environment variables plus configured
server-side AI provider keys into `.env.production` before `next build` so they
are available to the Next.js SSR runtime. Keep `GOOGLE_AI_API_KEY`,
`OPENAI_API_KEY`, and `X_AI_KEY` server-side only; do not prefix them with
`NEXT_PUBLIC_`. The build fails early if the required site/auth/Gemini variables
are missing from the selected Amplify app or branch. The OAuth callback route
uses `NEXT_PUBLIC_SITE_URL` for its final post-login redirect so Amplify internal
host headers cannot send users to `localhost`.

Add these redirect URLs in Google OAuth and Supabase auth settings:

- `https://matrix.almostcrackd.ai/auth/callback`
- `https://matrix.crackd.ai/auth/callback`

In Supabase Auth URL Configuration, set the Site URL to the canonical production
origin, `https://matrix.crackd.ai`. Keep the local callback URL for whichever
dev port is used locally. This app does not use a Supabase service-role key; all
Supabase requests should use the logged-in user's JWT.



## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## thanks for reading!
