# GitHub Pages

Toolnest is a static, browser-local app. GitHub Pages serves `dist/` over HTTPS; no backend, secret keys, npm dependencies or build step is needed. The optional cloud account uses Supabase with a public (publishable) key in `dist/cloud.js`.

## Deployment

The repository supports both Pages deployment modes:

- **Deploy from a branch → main → / (root)** publishes the repository. The root `index.html` opens the app in `dist/`, and `.nojekyll` disables Jekyll processing. GitHub's built-in Pages workflow handles publication; our workflow runs the engine tests and skips its separate deployment.
- **GitHub Actions** runs the engine tests, uploads only `dist/`, then deploys that same artifact. **Actions → Deploy Toolnest to GitHub Pages → Run workflow** can redeploy manually. The deployment URL is shown in the `github-pages` environment and the completed workflow. This mode gates publication on passing tests and excludes the source/test documents from the hosted files.

Both modes open the same application at https://jggroot.github.io/toolnest/. Only one deployment mode is active at a time. No further setting changes are needed when using branch publication.

Keep module imports, workers, fonts and other assets relative to their containing files. Project Pages runs under a repository subdirectory, not the domain root. No custom domain or SPA fallback is required.

Repository privacy and website privacy are separate. Ordinary GitHub Pages sites are public even when their source repository is private. Private-repository Pages requires a supported paid plan; access-controlled Pages requires a supported Enterprise organization setup.

## Move existing projects

Browser storage belongs to a website origin. On the old Toolnest address, save each project; check **Include foam photo in project backup** if you want that image to move too. Export the tool library separately. On the Pages address, open the downloaded project and import the library. Confirm dimensions and depths before exporting. Trace-source photographs are not included and must be selected again to retrace.

Projects, photos and library data remain local to each browser/device unless you sign in to the optional cloud account (see README). Its Supabase schema and `pair-redeem` edge function are in `supabase/`; the static Pages deployment itself needs no secrets. Share a downloaded project/library backup to move a design between people or machines. Keep backups outside the source repository.

## Development

Run `npm start`, then open http://localhost:3000. Run `npm test` before committing. Browser integration checks in `tests/` use development-environment-specific Playwright paths; they are not required dependencies of the app or the Pages workflow.

The photo/layout browser check accepts `TOOLNEST_URL` to test a repository subdirectory or deployed URL and `TOOLNEST_VIEWPORT` to limit the run to 390, 820 or 1440 CSS pixels. For example: `TOOLNEST_URL=http://localhost:3000/toolnest/ TOOLNEST_VIEWPORT=390 node tests/stock-photo-browser.mjs`. Use a test browser profile; the check creates synthetic projects, downloads exports and writes browser storage.

The GitHub source repository excludes old hosting identity, credentials, user photos, saved projects and local storage. Preserve the license notices in `dist/vendor/` and `dist/fonts/`.

## Account deletion service

Deploy the `delete-account` function alongside the static privacy update:

```sh
supabase functions deploy delete-account
```

Use the same Supabase project as `dist/cloud.js`. The function validates the caller's bearer token with Auth, derives the user id on the server, deletes that user's storage objects through the Storage API, then deletes the Auth user. Existing foreign keys cascade deletion to projects, drawers, tool library, captures and pairings. It uses Supabase's server-side service-role/secret binding; never put that key in the frontend. Keep JWT verification enabled where compatible with the project's signing keys; the function also verifies the token itself.

The deletion UI is explicitly destructive and requires typing `DELETE MY ACCOUNT`. It stops new sync jobs and awaits active ones on this device. Users must close other devices before deletion; downloaded files and local copies are separate. Provider backups/logs follow provider policies. A failed or missing function must show an error, never a success message. Storage removal can partly complete before a failure; retry is supported.

Before release, use a disposable account to verify storage with more than one folder, synced records, account removal and a second account's isolation. Verify a signed-out caller gets 401, foreign origins get 403, and the private bucket and RLS policies are applied in production. The checked-in migrations specify these protections; source review cannot verify live settings.

The notices need an operator contact channel and jurisdiction-specific review before a wider public launch. They deliberately avoid inventing legal deadlines, retention guarantees or blanket compliance claims.
