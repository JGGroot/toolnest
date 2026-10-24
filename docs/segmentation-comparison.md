# Segmentation comparison — 25 October 2026

## Method

The supplied sample set includes seven real photographs of tools on the Letter calibration sheet and, for each, a Gemini-generated image of the same scene with the tool painted solid black. Both images of a pair are calibrated with their own markers into the same sheet millimetres, so the Gemini silhouette (traced with Dark silhouette) serves as the reference outline. It is a generated reference, not a physical measurement, but it is independent of every method being compared.

Each method traced the real photo from **one tap** at the reference outline's most interior point. Scores: **IoU** (area overlap, 1 = identical), **mean** and **max** distance between the two boundaries in mm. One pair (the bit holder) could not be scored: its real photo shows only three of the four markers. Five further images are foam trays (useful for Detect pockets, not Trace). Measured on a Windows desktop in Edge; times include the per-tap work after the model is loaded. No sample photos are committed.

## Original single-pass method (v28)

The model saw the whole rectified photo, reduced to 1024 px, and its own most-confident mask was used.

| Tool | Quick IoU / max mm | Precise IoU / max mm |
| --- | ---: | ---: |
| Adjustable wrench | 0.941 / 3.3 | 0.063 / 146.8 |
| Ratchet | 0.033 / 142.5 | no outline |
| Multitool | 0.974 / 1.9 | 0.974 / 2.0 |
| Pipe wrench | 0.971 / 1.8 | 0.010 / 242.6 |
| Pliers | 0.959 / 2.3 | 0.039 / 201.5 |
| Punch | 0.960 / 1.8 | 0.905 / 47.4 |

Failures were whole-sheet answers (the paper is the most confident object in view) or single parts (a jaw, a handle).

## Two-pass method (v29)

1. *Which object?* The Smart edges outline under the tap (or, without one, a non-sheet answer from the model's whole-photo look).
2. *Exactly where?* The model looks again at just that object, cropped at full resolution. Precise also gets five taps spread along the outline. Candidates are reduced to the region under the tap; sheet-sized ones are rejected; the one agreeing best with the Smart edges outline is chosen. The existing edge snapper then refines it.

| Tool | Smart edges IoU / mean / max | Quick IoU / mean / max · time | Precise IoU / mean / max · time |
| --- | ---: | ---: | ---: |
| Adjustable wrench | 0.942 / 0.69 / 3.3 | 0.941 / 0.73 / 3.3 · 0.45 s* | 0.931 / 0.76 / 3.4 · 8.0 s |
| Ratchet | 0.823 / 1.10 / 3.9 | 0.855 / 0.88 / 4.4 · 0.18 s | 0.826 / 1.15 / 4.2 · 7.1 s |
| Multitool | 0.895 / 1.56 / 5.0 | 0.976 / 0.34 / 1.9 · 0.16 s | 0.971 / 0.39 / 2.0 · 7.6 s |
| Pipe wrench | 0.971 / 0.38 / 1.7 | 0.971 / 0.42 / 1.8 · 0.23 s | 0.964 / 0.57 / 2.4 · 6.9 s |
| Pliers | 0.966 / 0.35 / 2.2 | 0.962 / 0.38 / 2.1 · 0.28 s | 0.965 / 0.36 / 2.2 · 6.8 s |
| Punch | 0.947 / 0.70 / 9.3 | 0.960 / 0.30 / 1.8 · 0.28 s | 0.949 / 0.35 / 1.8 · 7.0 s |

\* first tap after loading.

## Model edge with shadow trim (v31)

On the live site the traced line hopped in and out of the region the model found, most visibly on the adjustable wrench. It also sometimes included the tool's shadow. Both came from the post-processing, which was measured on the same pairs (Quick, one tap):

| Tool | Snapped (v30) IoU / max · extra / missed mm² | Model edge, no trim IoU / max · extra / missed | Model edge + shadow trim + smoothing (v31) IoU / max · extra / missed |
| --- | ---: | ---: | ---: |
| Adjustable wrench | 0.941 / 3.3 · 135 / 165 | 0.960 / 1.9 · 126 / 73 | **0.969 / 1.3** · 48 / 104 |
| Ratchet | 0.855 / 4.4 · 178 / 27 | 0.837 / 3.4 · 233 / 7 | 0.847 / **2.7** · 212 / 11 |
| Multitool | 0.976 / 1.9 · 14 / 65 | 0.970 / 2.4 · 73 / 26 | **0.983 / 1.1** · 21 / 36 |
| Pipe wrench | 0.971 / 1.8 · 145 / 106 | 0.959 / 3.2 · 321 / 43 | 0.968 / 2.2 · 190 / 91 |
| Pliers | 0.962 / 2.1 · 149 / 127 | 0.971 / 1.6 · 170 / 37 | **0.976 / 1.4** · 130 / 43 |
| Punch | 0.960 / 1.8 · 57 / 113 | 0.965 / 0.9 · 125 / 28 | **0.973 / 0.9** · 82 / 35 |
| Average IoU | 0.944 | 0.944 | **0.953** |

*Extra* is area outside the reference (mostly shadow); *missed* is reference area left out.

- The snapper's average matched the raw model edge, but it moved the line both ways: it cut into the tool (missed area) and hopped onto shadow and reflections. Its worst errors were up to 4.4 mm.
- The raw model edge errs only outward, by including shadow.
- The shadow trim removes most of that shadow, and smoothing irons out the mask's staircase. Against the snapper, four of six tools improve on both overlap and worst error. The two dark tools with wide, soft shadows (ratchet and pipe wrench) score slightly lower on overlap; the ratchet's worst error still improves, while the pipe wrench's grows from 1.8 to 2.2 mm.
- The trim's thresholds (depth 2.5 mm, brightness 50–93% of paper, colour-balance difference 0.035, neighbour step 15% of paper) were tuned on these six tools. That is a small set, so the thresholds may need revisiting with more photos. Peeling paper-bright pixels too, or peeling deeper, ate into chrome that reflects the sheet.
- Precise improves on average too (0.934 → 0.936; ratchet 0.826 → 0.840, max 4.2 → 3.0 mm), but its masks tend to fall short of the tool rather than include shadow, so the trim matters less for it.
- Remaining shadow is in soft, wide penumbras beside dark tools (pipe wrench, ratchet). Even, diffuse light when photographing removes it at the source.

## Findings

- **Quick is the practical choice.** From one tap it matches or beats Smart edges on every tool, most clearly where Smart edges struggles (chrome multitool: max 5.0 → 1.9 mm; punch: 9.3 → 1.8 mm), in a fraction of a second.
- **Precise is equally accurate here but slow** (about 7 s per tap on this desktop, single-threaded on the CPU) and offers no measurable gain on this set.
- **Precise on WebGPU was unreliable.** In one page its answers degraded after a few photos (the same input that scored 0.95 in a fresh page scored 0.05 later), and it crashed a phone browser. It now always runs the 8-bit model on the CPU, which matched full precision.
- Single-pass segmentation was the main cause of the earlier failures, not the models: given the right object and a close-up view, both models find good edges.
- Remaining differences of 2–4 mm at a few points are mostly at chrome highlights, red-handled grips and the reference's own edges; check the overlay and outline before cutting.
