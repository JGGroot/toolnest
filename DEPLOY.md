# GitHub Pages

Toolnest is a static, browser-local app. GitHub Pages serves `dist/` over HTTPS; no ChatGPT account, backend, API keys, npm dependencies or build step is needed.

## Deployment

In repository Settings → Pages, select **GitHub Actions** as the source. A push to `main` runs the engine tests, uploads only `dist/`, then deploys that same artifact. **Actions → Deploy Toolnest to GitHub Pages → Run workflow** can redeploy manually. The deployment URL is shown in the `github-pages` environment and the completed workflow.

Keep module imports, workers, fonts and other assets relative to their containing files. Project Pages runs under a repository subdirectory, not the domain root. No custom domain or SPA fallback is required.

Repository privacy and website privacy are separate. Ordinary GitHub Pages sites are public even when their source repository is private. Private-repository Pages requires a supported paid plan; access-controlled Pages requires a supported Enterprise organization setup.

## Move existing projects

Browser storage belongs to a website origin. On the old Toolnest address, save each project; check **Include foam photo in project backup** if you want that image to move too. Export the tool library separately. On the Pages address, open the downloaded project and import the library. Confirm dimensions and depths before exporting. Trace-source photographs are not included and must be selected again to retrace.

Projects, photos and library data remain local to each browser/device. This deployment does not create shared team storage. Share a downloaded project/library backup to move a design between people or machines. Keep backups outside the source repository.

## Development

Run `npm start`, then open http://localhost:3000. Run `npm test` before committing. Browser integration checks in `tests/` use development-environment-specific Playwright paths; they are not required dependencies of the app or the Pages workflow.

The photo/layout browser check accepts `TOOLNEST_URL` to test a repository subdirectory or deployed URL and `TOOLNEST_VIEWPORT` to limit the run to 390, 820 or 1440 CSS pixels. For example: `TOOLNEST_URL=http://localhost:3000/toolnest/ TOOLNEST_VIEWPORT=390 node tests/stock-photo-browser.mjs`. Use a test browser profile; the check creates synthetic projects, downloads exports and writes browser storage.

Only `dist/` is uploaded to Pages. The GitHub source repository excludes old hosting identity, credentials, user photos, saved projects and local storage. Preserve the license notices in `dist/vendor/` and `dist/fonts/`.
