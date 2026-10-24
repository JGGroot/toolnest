# Segmentation comparison — 24 October 2026

Measured in headless Microsoft Edge on this Windows development computer. Times vary with hardware, cache state and network conditions; these are not phone hardware timings. Both models ran locally. All observed external tracing/runtime requests were GET requests; no photo upload or remote inference request occurred. Startup made no external requests.

Nineteen supplied local images were examined. Thirteen tool/reference images calibrated and produced regions with both engines; five foam images and one tool image with only three detected markers were rejected by Trace calibration. No supplied images or photo pixels have been committed.

| Engine | Weight bytes | First load in this run | Subsequent tap range, real images | Median tap |
| --- | ---: | ---: | ---: | ---: |
| Quick / MagicTouch (GPU) | 6,227,884 | 988 ms | 40–56 ms | 45 ms |
| Precise / SlimSAM (WebGPU) | 39,833,906 | 4,654 ms | 109–139 ms | 127 ms |

Runtime/weight fetches may have benefited from HTTP caches. The first Quick inference took 1,191 ms and the first Precise inference 479 ms. Precise's first generated-photo embedding took 1,211 ms; real-photo embeddings took approximately 0.7–0.8 seconds. Quick has no reusable encoder API; its timing reports embedding as zero and includes model work in each uncached point inference. In a separate forced-WASM run, Precise encoded the generated image in 5,954 ms and decoded taps in 185–196 ms. That run produced usable masks without WebGPU.

The automatic comparison puts one positive tap at a thick interior location of each Smart edges reference. These are single-tap results, not hand-corrected best cases. The table reports maximum symmetric point-to-segment distance from that reference, after snapping. Smart edges is another algorithm, not measured physical ground truth. A low value establishes agreement, not CNC accuracy; a high value often means that the model selected a component, filled a concavity, or missed a thin extension.

| Local filename | Quick difference (mm) | Precise difference (mm) |
| --- | ---: | ---: |
| 1792753518717.jpg | 1.10 | 1.11 |
| 1792756890416.jpg | 38.91 | 0.44 |
| 1792757987402.jpg | 3.59 | 3.57 |
| 1792758423078.jpg | 0.66 | 1.01 |
| 1792766712614.jpg | 1.23 | 201.07 |
| 1792766746805.jpg | 2.84 | 35.65 |
| 20261023_115415.jpg | 3.72 | 146.42 |
| 20261023_125350.jpg | 6.37 | 244.93 |
| 20261023_125933.jpg | 173.33 | 4.36 |
| 20261023_131648.jpg | 5.26 | 5.36 |
| 20261023_150738.jpg | 3.31 | 245.59 |
| 20261023_150755.jpg | 2.01 | 201.67 |
| 20261023_151009.jpg | 1.28 | 20.97 |

The generated three-tool sheet gave maximum differences of 1.21, 11.48 and 0.52 mm for Quick, versus 58.06, 0.44 and 75.46 mm for Precise. Neither engine meets the brief's approximately 0.5 mm single-tap boundary target across the sample. Quick generally selected whole tools more consistently in this set. Precise sometimes selected just a handle, jaw or joint; extra positive points are necessary. The UI supports that refinement, but multi-tap quality has not been exhaustively measured for every supplied photo.

Both candidates remain available for owner evaluation. Export uses the currently selected engine's accepted geometry; the second coloured comparison is display-only. Inspect actual overlays and dimensions before choosing an engine for a particular tool.

Automated real-model UI checks passed at 1440 and 390 px: positive and negative prompts, refinement outside the first mask, engine comparison, global undo/redo, undo tap, pan and touch pinch without added prompts, smoothing without lost prompts, project save/open, offline fallback and cancellation. The 390 px check uses a desktop browser viewport, not a physical phone. Unit tests independently check mask dimensions within 0.3 mm and origin/point mapping.
