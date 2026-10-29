# People Manager

A small application for managing people, with persistent storage, anonymous ownership, and CSV export.

This README describes the agreed architecture and intended behavior. Application code and deployment have not been created as part of this design document.

## Scope

Each visitor owns a private collection of people. A person has a name, email address, and age. Visitors can create, read, update, delete, and export their records.

| Action | Expected behavior |
| --- | --- |
| Open the application | Restore the anonymous session and load the owner's list. Retrieve record IDs and names; display only names. |
| Select a person | Fetch that person's complete saved record and populate the form. |
| Create a new person | Clear the current selection and form, and start a new draft. No database row exists until Save succeeds. |
| Save | Persist the draft under its stable record ID and refresh the relevant saved data. |
| Delete | Remove the selected saved record. After success, remove it from the list and clear its form. |
| Reload | Restore the owner's list and reload the selected saved record when a selection is present. Unsaved changes are discarded. |
| Export | Download all the owner's saved people as a CSV containing Name, Email, and Age. |

To preserve the original requirement to restore the same form after a reload, the selected saved record ID is represented in a URL query parameter. Selection is navigation state; personal field values remain in the database. An absent or unavailable selection leaves a blank form. Starting a new draft clears the selection parameter.

For this assignment, switching records or starting a new draft discards unsaved edits. These are explicit behavior assumptions, without an additional draft recovery workflow.

## Technology choices

| Concern | Technology | Responsibility |
| --- | --- | --- |
| Application | React, TypeScript, Vite | SPA and build tooling |
| Styling and components | Tailwind CSS, shadcn/ui | Application presentation |
| Form state | React Hook Form | Draft state owned by the form's owning component |
| Validation | Zod | Explicit input schema |
| Server state | TanStack Query | Saved list/detail state and cache synchronization |
| Data access | Supabase JS SDK | Supabase integration |
| Persistence | Supabase Postgres | Durable records and database constraints |
| Identity and authorization | Supabase anonymous Auth and Row Level Security | Ownership and access enforcement |
| CSV serialization | Papa Parse | CSV quoting, escaping, and spreadsheet formula protection |
| Hosting | Vercel | Static application hosting and Git-triggered builds/deployments |
| UI testing | Playwright | Browser tests covering the application's user workflows |
| Continuous integration | GitHub Actions | Run Playwright against Vercel preview deployments and publish results |

The Supabase SDK covers the data-access requirement, so Axios is unnecessary for this stack. TanStack Query manages server state independently of the form's draft.

## System boundaries

Vercel serves the compiled SPA. Supabase supplies identity, data access, and Postgres storage. CSV generation runs in the browser using the owner's saved records.

The application separates record operations, input validation, and CSV serialization from presentation. Supabase-specific details stay within the data-access boundary. The database enforces ownership and stored-data constraints regardless of the client.

This workload requires one frontend deployment and one managed backend project. No custom application server is planned.

## Data model

The `people` table contains multiple records per owner.

| Field | Type | Rule |
| --- | --- | --- |
| `id` | UUID | Primary key; allocated once for a new draft and retained through save retries |
| `owner_id` | UUID | Required reference to the Supabase Auth user; indexed and immutable through normal record edits |
| `name` | Text | Required; nonblank; maximum 200 characters |
| `email` | Text | Required; maximum 254 characters |
| `age` | Integer | Required; between 0 and 150 inclusive |
| `created_at` | Timestamp with time zone | Set by the database on creation |
| `updated_at` | Timestamp with time zone | Set by the database when editable values actually change |

The length and age limits are assignment assumptions. Names and emails need not be unique. Email is record data and does not authenticate the owner.

Input validation checks the required fields, email format, and age range. Database constraints enforce the required values, lengths, and integer range as the persistence boundary.

## Anonymous ownership

Restore an existing anonymous session before creating a new anonymous identity. All people belong to that identity through `owner_id`.

Row Level Security restricts reading, creating, updating, and deleting to records owned by the current authenticated identity. Both existing-row access and proposed ownership on writes must be checked. Ownership is enforced in the database, including for export.

Supabase anonymous users have authenticated identities; this differs from unauthenticated public access. The frontend uses the publishable project key with RLS enabled. Privileged Supabase keys are not included in the frontend.

The session survives ordinary reloads. Clearing browser data or losing the session loses access to the old collection. Permanent accounts, recovery, and cross-device access are outside this assignment.

## Draft and saved state

Postgres holds authoritative saved records. TanStack Query holds the application's last confirmed server state. The form's owning component owns the editable draft.

A form is saved when a persisted record is confirmed and its editable values equal the current draft. Compare name, email, and age using consistent normalization; database metadata is not part of that comparison. A blank new draft is not saved merely because there are no differences to display.

A successful save confirms the submitted snapshot. If the draft changes while that save is pending, it remains unsaved until those newer values are also persisted. A failed or unconfirmed save must not mark the draft as saved. Failed saves retain the draft for retry.

Successful changes update the relevant list and detail state. Deletion clears the deleted record from both. Only the currently selected record may supply the form's loaded data. Cache entries are scoped to the owner and, for details, the record ID.

## Idempotency

| Operation | Contract |
| --- | --- |
| Fetch list or details | Does not modify person records. Repeating a fetch has no additional write effect. |
| Create/save | The same record ID and payload produce the same persisted person. Retries reuse the draft ID, including after an uncertain network outcome, so they cannot create duplicate rows. |
| Update | Assigns the intended values. Repeating an identical save is a no-op, including for `updated_at`. |
| Delete | Ensures the owned record is absent. Repeating deletion of an already absent record succeeds as a no-op. Authentication, authorization, and network failures still remain failures. |

A genuinely new draft receives a new ID. A retry reuses the ID and payload of the original operation. Record-changing operations are ordered within the active tab, preventing an older pending save from overtaking a newer save or deletion.

The application assumes one active browser tab. Multi-tab coordination, concurrent editing, and conflict resolution are outside scope; behavior in those situations is unspecified.

## CSV export

Export includes all saved records owned by the current anonymous user, with fixed columns `Name`, `Email`, and `Age`, ordered by name and then ID for deterministic ordering.

Export retrieves the complete saved dataset. The name-only list and already opened details are insufficient sources. Retrieval must cover all records if the backend limits individual responses; never silently export only the first batch.

Unsaved draft changes are excluded. The CSV uses UTF-8, includes a header, correctly escapes commas, quotes, and newlines, and enables spreadsheet formula escaping. An empty collection produces a header-only file. A failed retrieval must not produce a partial export.

## Setup and deployment

Configure one Supabase project manually: enable anonymous sign-ins, create the table and constraints above, and configure the ownership policies and necessary permissions. This is initial project setup; no migration tooling or deployment migration step is included.

The intended application configuration uses:

| Setting | Value |
| --- | --- |
| Supabase project URL | `VITE_SUPABASE_URL` |
| Supabase publishable key | `VITE_SUPABASE_PUBLISHABLE_KEY` |
| Vercel framework preset | Vite |
| Build command | `npm run build` |
| Build script responsibility | Compile and bundle the application |
| Output directory | `dist` |

Connect the repository to Vercel and supply the environment variables. After dependency installation, Vercel builds and deploys the application through its Git integration. Production tracks the configured production branch.

The Vercel deployment step remains build-only, with no lint, migration, or test commands added to its build configuration. Automated UI testing is required in a separate GitHub Actions pipeline.

## Required GitHub Actions pipeline

Provide a workflow at `.github/workflows/playwright.yml` that runs after a successful Vercel preview deployment for a pull request. Test the exact deployed commit and use that deployment's URL as the test target. Production deployments do not trigger this suite.

The workflow must install locked dependencies and the required Playwright browser dependencies, run the UI suite in Chromium, and publish an HTML report. Retain traces and screenshots for failed tests to make failures diagnosable. A failing test must fail the workflow.

Report the result against the tested commit and require a successful UI-test check before merging into the production branch. This gates merging; the preview deployment already exists when tests start. If preview deployment protection is enabled, configure automation access for the test runner.

Each test uses an isolated anonymous browser session and creates its own records. Reload checks reuse that test's session. Tests must not depend on execution order or existing user data, and must clean up their own saved records. Browser interactions drive the functional scenarios; assertions verify visible behavior and downloaded file contents.

Use the real Supabase-backed application for the main persistence workflow. Playwright request interception may simulate delays and failures for error scenarios. Such scenarios verify UI behavior and do not establish database authorization or durability guarantees. No separate API-mocking library is required by this design.

## Required UI coverage

| Area | Required behavior to verify |
| --- | --- |
| Initial state and list | A new visitor sees an empty collection; saved records appear by name without exposing email or age in the list. |
| Selection | Selecting a name loads the correct person's fields. Rapid selection changes must not let an older response replace the current person's details. |
| New record | Starting a new item clears the form and selection without inserting a row before Save. |
| Create and update | Saving adds one record; editing and saving changes that same record and its list name. Repeated saves and retries do not add duplicates. |
| Reload | Saved records and the selected person's details are restored; unsaved edits are discarded. |
| Draft state | Changes mark the form unsaved. A confirmed matching save marks it saved. If editing is allowed during a pending save, newer edits remain unsaved. |
| Validation | Missing fields, invalid email, and non-integer or out-of-range age prevent saving and produce visible feedback. Valid boundary values are accepted. |
| Delete | Successful deletion removes the person from the list and clears the form; reload confirms absence. Retrying an already completed deletion is handled as a no-op. |
| CSV export | Download contains every owned saved record, including people whose details were never opened, in the defined column order. Unsaved edits are excluded. Cover empty exports, CSV escaping, and formula protection. |
| Failure and retry | Loading, saving, deleting, and export failures provide feedback. Save failure retains the draft and does not mark it saved; delete failure retains the record; export failure produces no partial file. Retrying can recover. |
| Anonymous isolation | Separate anonymous sessions display and export their own records. This is a UI check, not a substitute for testing RLS independently. |

The suite assumes one tab per session. Multi-tab behavior remains outside scope. No linting or migration steps are added to either pipeline.

## References

- [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [TanStack Query overview](https://tanstack.com/query/latest/docs/framework/react/overview)
- [Papa Parse CSV documentation](https://www.papaparse.com/docs)
- [Vercel project configuration](https://vercel.com/docs/project-configuration)
- [Playwright continuous integration](https://playwright.dev/docs/ci)
- [Playwright after a Vercel preview deployment](https://vercel.com/kb/guide/how-can-i-run-end-to-end-tests-after-my-vercel-preview-deployment)
