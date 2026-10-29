# Setup and verification

The repository contains the application, manual database setup, tests, and hosting configuration. Creating and connecting Supabase, GitHub, and Vercel projects is a manual step.

## Run locally

Use Node.js 24 and npm. Install the locked dependencies:

```sh
npm ci
```

Create a Supabase project, then:

1. In **Authentication → Sign In / Providers**, enable anonymous sign-ins.
2. Open the SQL Editor and execute [`supabase/setup.sql`](../supabase/setup.sql) once in a fresh project. It creates the table, constraints, permissions, ownership policies, and timestamp triggers. This is manual initial setup; it is not a migration pipeline.
3. Copy `.env.example` to `.env.local`. Set the project URL and publishable key from the Supabase project's Connect dialog. The browser requires these public values; never substitute a secret key or a legacy `service_role` key.
4. Start the application:

```sh
npm run dev
```

Changing a Vite environment variable requires restarting the development server or rebuilding the application. A missing or invalid configuration produces a setup message in the UI.

The anonymous session is saved in this browser. Clearing browser storage loses access to its people. A private/incognito window creates a separate owner. There is no recovery or cross-device account flow.

## Validate the implementation

```sh
npm run build
npm run lint
npx playwright install chromium
npm run test:local
npm run test:backend
npm run test:e2e
```

- `test:local` runs browser checks with intercepted Supabase responses. These checks can run without a Supabase project and verify UI behavior, not database security or persistence.
- `test:backend` uses the real Supabase project to verify ownership policies, data constraints, and idempotent writes. It uses only the project's public URL/key and separate anonymous identities.
- `test:e2e` runs the Chromium workflows against the real backend. Without `BASE_URL`, the Playwright configuration builds and serves the production application locally. With `BASE_URL`, it tests that deployment directly.

Backend and real UI tests require the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` values as the app. Keep them in `.env.local` for local runs. To target a deployment from PowerShell:

```powershell
$env:BASE_URL = 'https://your-exact-preview.vercel.app'
npm run test:e2e
Remove-Item Env:BASE_URL
```

Each real test uses an isolated anonymous identity and cleans up its saved records, including on failure. Tests create anonymous Auth users; deleting the people does not delete those Auth users. Supabase's default anonymous sign-in rate limit can be too low for repeated full-suite runs from one IP. Adjust the test project's anonymous sign-in limit before running the suite repeatedly, and leave browser workers at the configured conservative value. If CAPTCHA is enabled, provide an appropriate test-project configuration; the suite does not automate CAPTCHA challenges. See [Supabase anonymous Auth limits](https://supabase.com/docs/guides/auth/auth-anonymous#abuse-prevention-and-rate-limits).

Open the HTML report with `npx playwright show-report`. Failed browser tests retain traces and screenshots in `test-results`. Report unexecuted real-backend and preview checks explicitly; passing intercepted tests is not a substitute.

## Connect Vercel

1. Push the repository to GitHub and import it into Vercel through the Git integration.
2. Select Node.js 24 and the Vite framework preset. The committed `vercel.json` specifies `npm run build` and the `dist` output directory.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for Preview and Production. They are compiled into the frontend at build time. Use the same backend values in the test runner for that environment.
4. Set the production branch to `master`, or change it consistently in Vercel and the GitHub variable below.
5. Trigger a Git deployment. Vercel installs dependencies and runs the build; it does not run lint, migrations, or tests as part of deployment.

Hashed assets have an immutable one-year cache policy. The HTML entry point is not cached. SPA rewrites preserve direct navigation and reloads. After deployment, verify that selecting a saved person and reloading its `?person=` URL restores the saved record.

## Enable preview UI tests and the merge gate

The workflow uses Vercel's repository-dispatch integration. It accepts both `vercel.deployment.ready` and `vercel.deployment.success`, since Vercel's package documents `ready` for completed unpromoted previews while its end-to-end guide uses `success`. In either case, production events are ignored. See the [Vercel event definitions](https://github.com/vercel/repository-dispatch/tree/main/packages/repository-dispatch#supported-events) and [preview testing guide](https://vercel.com/kb/guide/how-can-i-run-end-to-end-tests-after-my-vercel-preview-deployment).

1. Connect the GitHub repository through the Vercel GitHub integration and ensure repository-dispatch events are enabled. The workflow must exist on GitHub's **default branch** before automatic dispatches can run it.
2. Under **GitHub repository → Settings → Secrets and variables → Actions → Variables**, configure:

   | Variable | Value |
   | --- | --- |
   | `VERCEL_PROJECT_ID` | The exact `prj_…` project ID from Vercel project settings |
   | `VITE_SUPABASE_URL` | The Supabase URL used by preview deployments |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | The public publishable key used by previews |
   | `PRODUCTION_BRANCH` | Optional; defaults to `master` |

3. If preview deployment protection is enabled, create a Vercel **Protection Bypass for Automation** secret and store it as the GitHub Actions secret `VERCEL_AUTOMATION_BYPASS_SECRET`. The test fixture exchanges it for a cookie scoped to the deployment. It does not attach the secret to Supabase requests. See [Vercel automation access](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).
4. Open a pull request from a branch in this repository into the production branch. Wait for Vercel's successful preview and the **Preview UI tests** workflow.
5. Verify that the run's checked-out SHA is the deployed SHA, its target is that deployment's unique URL, and the PR commit receives the status **People Manager UI**. Production deployments, other Vercel projects, stale PR commits, branch-only previews, and fork PRs are ignored.
6. Add a branch protection rule or repository ruleset for the production branch. Require **People Manager UI** before merging, and select GitHub Actions as the expected source when available. Require this explicit commit status, rather than the dispatch workflow's native job checks: repository dispatch itself runs in the default-branch context, while the explicit status is attached to the tested PR commit.

The suite installs locked dependencies and Chromium system dependencies, then tests the deployed commit without building another deployment. A failing test fails the workflow and commit status. HTML reports and failure diagnostics are uploaded as artifacts with 14-day retention. Status-writing permissions are confined to the metadata and reporting jobs; the job that checks out PR code has read-only repository permissions.

This gate prevents merging until the UI suite succeeds. The preview already exists by the time testing starts. Confirm dispatch receipt and the required status on the first real PR before relying on the rule.
