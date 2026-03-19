# Data Reconstruction Report — Feb 13 Positives

**Date:** 2026-02-27
**Author:** Track B (Data team)
**Phase:** 3 + 4 (Reconstruct-First Recovery Plan)

---

## Summary

Successfully reconstructed the 252 Feb-13 positive training images from the
`final_combined_1class_20260215` manifest. All acceptance gates passed.

---

## Inputs

| Field | Value |
|---|---|
| Manifest | `data/datasets/final_combined_1class_20260215/manifest.csv` |
| Image root | `data/datasets/final_combined_1class_20260215` |
| `--source-root-filter` | `20260213` |
| Predicate 1 | `source_root` contains `"20260213"` |
| Predicate 2 | `source_split == "train"` |
| Predicate 3 | `box_count >= 1` |

**Rationale for filter:** The Feb-13 dataset rows in the manifest have
`source_root` values containing `final_combined_1class_20260213`.
Using `"20260213"` as the substring filter selects exactly those rows.

**Path resolution note:** Original `source_image`/`source_label` paths no
longer exist at the annotation origin. Files were resolved via the
`target_image`/`target_label` columns in the manifest, which record where
the combine step stored each file within `final_combined_1class_20260215`.
This is consistent with the plan note: *"Source payload for manifest SHA
resolution remains available in `final_combined_1class_20260215`."*

---

## Output

| Path | Description |
|---|---|
| `data/datasets/final_combined_1class_20260213_recovered_pos252/train/images/` | 252 recovered images |
| `data/datasets/final_combined_1class_20260213_recovered_pos252/train/labels/` | 252 recovered label files |
| `data/datasets/final_combined_1class_20260213_recovered_pos252/reconstruction_manifest.csv` | Per-pair SHA + path log |
| `data/datasets/final_combined_1class_20260213_recovered_pos252/reconstruction_report.json` | Machine-readable pass/fail report |

---

## Acceptance Gate Results (Phase 4)

| Criterion | Expected | Actual | Status |
|---|---:|---:|:---:|
| `selected_rows` | 252 | 252 | ✅ PASS |
| `recovered_pairs` | 252 | 252 | ✅ PASS |
| `missing_count` | 0 | 0 | ✅ PASS |

---

## Label Validation

All 252 label files checked:
- No empty files
- All lines conform to YOLO format: `class cx cy w h` (5 space-separated values per line)

**Result: PASS**

---

## Determinism Check

Script executed a second time to a temporary output directory.
Sorted SHA1 lists from both runs compared — **identical (252 entries)**.

**Result: PASS**

---

## Overall Verdict

**PASS** — All acceptance criteria met. The reconstructed dataset at
`data/datasets/final_combined_1class_20260213_recovered_pos252` is ready
as input for Phase 6 ablation (neg0/neg20/neg100 datasets).

---

## Artifact Paths

- Reconstruction report (JSON): `data/datasets/final_combined_1class_20260213_recovered_pos252/reconstruction_report.json`
- Reconstruction manifest (CSV): `data/datasets/final_combined_1class_20260213_recovered_pos252/reconstruction_manifest.csv`
