# Task: "Tap to cut out" tool segmentation in Trace (MediaPipe + SAM)

## Goal

Add an optional **Tap to cut out** tracing mode to the Trace workspace. The user taps a tool on the calibrated photo and gets its outline from a segmentation model running **in the browser**. Implement two engines behind one UI so they can be compared:

1. **Quick**: MediaPipe Interactive Segmenter (Google, Apache-2.0, ~10 MB model, point-prompted).
2. **Precise**: a SAM-family model (prefer **SlimSAM** or **MobileSAM** via Transformers.js; SAM 2 tiny if it runs acceptably), point-prompted.

The model's mask must feed the **existing** outline pipeline, so marker calibration, millimetre scale, edge snapping, smoothing, clearance, finger grips, export and library saving keep working unchanged.

## Ground rules for this repo (read before coding)

- **No build step.** `dist/` is the shipped source, served as static files by GitHub Pages (https://jggroot.github.io/toolnest/dist/). Plain ES modules, no bundler, no npm runtime dependencies. Run locally with `npm start` (port 3000) or any static server on `dist/`.
- **Code style:** dense, mostly one-line JavaScript with short comments explaining *why*. Match the surrounding style; don't reformat existing files.
- **Cache-busting:** every module import and the stylesheet links carry a `?v=<tag>` query (currently `20261024-scan2`). When you change files, replace the tag everywhere in `dist/` and `tests/` with a new one (e.g. `20261025-seg1`), and bump the visible version in `dist/index.html` (`<small class="build-tag" title="App version">v27</small>` → `v28`).
- **Third-party code is vendored or lazily loaded, never loaded at startup.** Existing vendored libraries live in `dist/vendor/` with their licence files. Startup must not download any model or ML runtime. Load them only when the user picks Tap to cut out, and show download progress. Pin exact versions that are at least two weeks old. Licences must permit commercial use: check them, and add licence files and a line to `dist/vendor/BUNDLED-NOTICES.txt`. **Do not use RMBG-1.4 or other non-commercial weights.**
- **Privacy promise:** photos never leave the device for tracing. Models must run locally (WASM/WebGPU). Fetching model *weights* from a CDN (jsDelivr / Hugging Face) is allowed. Vendoring is also fine, but GitHub Pages rejects files over 100 MB and the repo should stay small, so prefer CDN loading for SAM weights and document it.
- **Tests:** `npm test` runs node unit tests (`tests/*.test.mjs`) and must stay green; CI runs it before deploying. Add unit tests for any pure logic you write (mask → outline conversion, coordinate mapping, prompt-point mapping). Browser tests under `tests/*.mjs` (non-`.test`) use environment-specific Playwright paths and open `http://127.0.0.1:3000/?sample`, where `?sample` loads a generated sample sheet with three tools. You may add a browser check, but don't rely on it in CI.
- **Docs:** add a README section (style: factual, what it does, how accuracy is preserved, its limits, how it's tested). Keep the README's existing tone.
- Phones matter: test at 390 px wide. Nothing may make the page scroll sideways (`dist/mobile.css` locks horizontal scroll). Tap targets ≥ 44 px.

## How Trace works today (where to plug in)

- `dist/app.js` → `processImage(image)` calls `prepareCaptureAsync` (`dist/capture-client.js`, worker `dist/capture-worker.js`), which runs `prepareCapture` in `dist/capture-model.js`:
  `autoCalibrate(image)` (finds the four printed markers) → `warpExtended(image, cal.H, paper)` (rectifies the sheet plus surroundings to **3 px/mm**, with `rect.origin` = millimetre offset of the image's top-left relative to the sheet, and `rect.scale` px/mm; alpha 0 = outside the photo) → `extract(rect, paper, threshold, minArea, method, options)` in `dist/vision.js`.
- `extract` builds a binary **mask**, turns it into polygons with `contours(mask, w, h, scale, minArea)` (returns rings in **millimetres**, outer rings only), then `refinePaths` → `snapToEdges` refines each outline against the photo's real edges (shadow and chrome aware). Follow `extractExtended` for how rectified images with an `origin` map to sheet millimetres.
- Trace methods are chosen by `<select id="traceMethod">` in `dist/index.html` (`edges` = Smart edges, `dark` = Dark silhouette). Settings flow through `DEFAULT_SETTINGS` / `traceKey` / `traceOptions` / `computePreview` in `dist/preview-model.js` (also run in `dist/preview-worker.js`). Tools live in `state.tools` as `{name, points}` in sheet millimetres.

## What to build

### 1. A new module `dist/segment.js` (engine-agnostic, lazily imported)

- `loadSegmenter(engine, onProgress)` → `{segment(imageData, points) → {mask, width, height}}` for `engine` ∈ `'mediapipe' | 'sam'`. Cache the loaded engine per page.
- **MediaPipe:** `@mediapipe/tasks-vision` `InteractiveSegmenter` with the `magic_touch` model. Use a GPU delegate when available, CPU otherwise. Load the WASM files and model from jsDelivr or vendor them.
- **SAM:** Transformers.js (`@huggingface/transformers`) with `Xenova/slimsam-77-uniform` (or a MobileSAM ONNX), on WebGPU when `navigator.gpu` exists, else WASM.
  - Compute the image embedding **once per photo** and cache it, so extra taps only run the light decoder.
  - Support positive taps and negative taps (long-press or a "remove" toggle marks background). Pick the best of the returned masks by IoU score.
- Run inference off the main thread if practical (a module worker). Otherwise keep the UI responsive and show a spinner.
- Feed the model the **rectified** image (`rect`), not the raw photo, so the mask is already in sheet millimetres. Mind the size: the rectified image can be large (`EXTEND_PIXELS` up to 4.5 MP). Downscale for the model, then upscale the mask back to `rect` resolution before tracing.

### 2. Mask → tool outlines (pure, testable)

- A function such as `maskToPaths(mask, rect, paper, options)` reusing `contours` and `refinePaths`/`snapToEdges` from `dist/vision.js`. Export what you need from `vision.js` rather than duplicating it.
- Apply the same coordinate handling as `extractExtended` so paths are in sheet millimetres even when the tool extends past the printed sheet.
- Snapping to real edges must stay on by default: the model gives the region, the existing snapper gives the edge.
- Unit-test it with synthetic masks (rectangle and circle at known millimetre sizes, including one that crosses the sheet border) and assert sizes within ±0.3 mm.

### 3. UI in Trace

- A third trace method: `<option value="tap">Tap to cut out · on-device AI</option>`. When chosen:
  - Show an engine toggle **Quick (MediaPipe) / Precise (SAM)**, default Quick, remembered in localStorage.
  - Show a hint "Tap a tool to cut it out" with a **Remove area** toggle for negative points, plus **Undo tap** and **Clear**.
  - Tapping the overlay adds a prompt point in rectified-image coordinates. The tapped tool's outline appears (and is added to `state.tools` with a name like `Tool 1`). Tapping another tool adds a second tool. Tapping inside an existing tool refines that one.
- First use downloads the model: show a progress bar with the size, and allow cancelling. If WebGPU/WASM loading fails, explain the failure and offer **Smart edges** instead.
- Existing settings (clearance, smoothing, grips) and **✓ Save all to library** must work on tap-traced tools exactly as on others. Undo/redo must cover adding a tapped tool.
- Retracing (`computePreview(..., retrace)`) must not wipe tapped tools when unrelated settings change. Store the prompt points per tool (in sheet millimetres) so changing the engine or retracing can re-run them. Project save/open must keep tapped tools; check `validProject` in `app.js` if you add fields.
- Phones: taps must not conflict with pinch-zoom or pan on the overlay. Follow how the existing Trace canvas distinguishes taps from drags.

### 4. Comparison aid (temporary, behind `?segcompare`)

- With `?segcompare` in the URL, show both engines' outlines for the same taps in two colours, with each one's time in ms, so the owner can judge quality. Hidden in normal use.

## Acceptance checklist

- [ ] `npm test` passes, including new unit tests for mask → paths and point mapping.
- [ ] Startup network requests are unchanged (no model or runtime fetched until Tap to cut out is chosen).
- [ ] On desktop Chrome: tapping each of the three tools on `/?sample` gives outlines within ~0.5 mm of the Smart edges result, for both engines. Report timings: first load, embedding and per tap.
- [ ] On a 390 px phone viewport: the mode is usable, no sideways page scroll, and pinch-zoom still works.
- [ ] Failing to load (offline, no WebGPU) falls back gracefully with a message.
- [ ] Licences recorded in `dist/vendor/` and `BUNDLED-NOTICES.txt`. README section added. Version tag and `v28` bumped.
- [ ] Commit on a branch (not `main`), one commit per logical step, messages in the repo's style (imperative subject, bullet body). Open a PR summarising engine timings, model sizes and any accuracy differences. Don't merge.
