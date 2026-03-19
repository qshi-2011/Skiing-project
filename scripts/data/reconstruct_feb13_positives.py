"""
Reconstruct the Feb-13 positive training images from the combined dataset manifest.

Filters the manifest for:
  - source_root contains --source-root-filter substring
  - source_split == "train"
  - box_count >= 1

Deduplicates by SHA1 (first-seen wins), then copies image+label pairs
into a YOLO train layout at --output.

Usage:
    python scripts/data/reconstruct_feb13_positives.py \
      --manifest data/datasets/final_combined_1class_20260215/manifest.csv \
      --image-root data/datasets/final_combined_1class_20260215 \
      --output data/datasets/final_combined_1class_20260213_recovered_pos252 \
      --source-root-filter 20260213
"""
from __future__ import annotations

import argparse
import csv
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reconstruct Feb-13 positive training images from manifest"
    )
    parser.add_argument(
        "--manifest",
        default="data/datasets/final_combined_1class_20260215/manifest.csv",
        help="Path to the manifest CSV",
    )
    parser.add_argument(
        "--image-root",
        default="data/datasets/final_combined_1class_20260215",
        help="Root directory for resolving source paths (informational only)",
    )
    parser.add_argument(
        "--output",
        default="data/datasets/final_combined_1class_20260213_recovered_pos252",
        help="Output directory for reconstructed dataset",
    )
    parser.add_argument(
        "--source-root-filter",
        default="20260213",
        help="Substring to match in source_root column",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    manifest_path = Path(args.manifest).resolve()
    image_root = Path(args.image_root).resolve()
    output_dir = Path(args.output).resolve()
    source_root_filter = args.source_root_filter

    print(f"Manifest:          {manifest_path}")
    print(f"Image root:        {image_root}")
    print(f"Output dir:        {output_dir}")
    print(f"Source root filter: {source_root_filter!r}")
    print()

    # ------------------------------------------------------------------
    # 1. Load manifest CSV
    # ------------------------------------------------------------------
    if not manifest_path.exists():
        print(f"ERROR: Manifest not found: {manifest_path}", file=sys.stderr)
        sys.exit(1)

    manifest_parent = manifest_path.parent

    with manifest_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        all_rows = list(reader)

    print(f"Total manifest rows: {len(all_rows)}")

    # ------------------------------------------------------------------
    # 2. Filter rows
    # ------------------------------------------------------------------
    filtered: list[dict] = []
    for row in all_rows:
        if source_root_filter not in row["source_root"]:
            continue
        if row["source_split"] != "train":
            continue
        try:
            box_count = int(row["box_count"])
        except ValueError:
            continue
        if box_count < 1:
            continue
        filtered.append(row)

    print(f"Rows after filter (source_root contains {source_root_filter!r}, "
          f"source_split==train, box_count>=1): {len(filtered)}")

    # ------------------------------------------------------------------
    # 3. Dedup by SHA1 (first-seen wins)
    # ------------------------------------------------------------------
    seen_sha: dict[str, dict] = {}
    deduped: list[dict] = []
    for row in filtered:
        sha = row["sha1"]
        if sha not in seen_sha:
            seen_sha[sha] = row
            deduped.append(row)

    print(f"Rows after SHA1 dedup:                       {len(deduped)}")
    print()

    # ------------------------------------------------------------------
    # 4. Prepare output directories
    # ------------------------------------------------------------------
    dest_images = output_dir / "train" / "images"
    dest_labels = output_dir / "train" / "labels"
    dest_images.mkdir(parents=True, exist_ok=True)
    dest_labels.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # 5 & 6. Resolve source paths and copy files
    #
    # Source files (source_image/source_label) may no longer exist at their
    # original annotation paths. The plan specifies resolving by SHA from
    # the available payload in final_combined_1class_20260215.
    #
    # The manifest's target_image column stores paths of the form:
    #   artifacts/final_combined_1class_20260215/train/images/FILENAME
    # These map to: image_root / (suffix after "final_combined_1class_20260215/")
    # i.e. image_root / "train/images/FILENAME"
    # ------------------------------------------------------------------
    _ARTIFACT_PREFIX = "final_combined_1class_20260215/"

    def _resolve_target(target_rel: str, root: Path) -> Path:
        """Resolve a target_image / target_label path to its actual location.

        Strips the leading artifacts/.../final_combined_1class_20260215/ portion
        and resolves the remainder against image_root.
        """
        idx = target_rel.find(_ARTIFACT_PREFIX)
        if idx != -1:
            rel = target_rel[idx + len(_ARTIFACT_PREFIX):]
        else:
            rel = target_rel
        return (root / rel).resolve()

    recovered = 0
    missing: list[dict] = []
    manifest_rows: list[dict] = []

    for row in deduped:
        sha = row["sha1"]
        src_img_path = _resolve_target(row["target_image"], image_root)
        src_lbl_path = _resolve_target(row["target_label"], image_root)

        # Check both source files exist
        img_missing = not src_img_path.exists()
        lbl_missing = not src_lbl_path.exists()

        if img_missing or lbl_missing:
            missing_path = str(src_img_path) if img_missing else str(src_lbl_path)
            print(f"  MISSING: sha={sha[:12]} path={missing_path}")
            missing.append({"sha1": sha, "source_image": str(src_img_path)})
            continue

        # Destination filenames — keep original basename
        img_filename = src_img_path.name
        lbl_stem = src_img_path.stem
        lbl_filename = lbl_stem + ".txt"

        dest_img = dest_images / img_filename
        dest_lbl = dest_labels / lbl_filename

        shutil.copy2(src_img_path, dest_img)
        shutil.copy2(src_lbl_path, dest_lbl)

        recovered += 1
        manifest_rows.append(
            {
                "sha1": sha,
                "source_image": str(src_img_path),
                "source_label": str(src_lbl_path),
                "dest_image": str(dest_img),
                "dest_label": str(dest_lbl),
                "box_count": row["box_count"],
            }
        )

    print(f"Successfully copied pairs: {recovered}")
    print(f"Missing pairs:             {len(missing)}")
    print()

    # ------------------------------------------------------------------
    # 7. Write reconstruction_manifest.csv (sorted by sha1)
    # ------------------------------------------------------------------
    manifest_rows_sorted = sorted(manifest_rows, key=lambda r: r["sha1"])
    recon_manifest_path = output_dir / "reconstruction_manifest.csv"
    with recon_manifest_path.open("w", newline="", encoding="utf-8") as fh:
        fieldnames = ["sha1", "source_image", "source_label", "dest_image", "dest_label", "box_count"]
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(manifest_rows_sorted)

    print(f"Reconstruction manifest: {recon_manifest_path}")

    # ------------------------------------------------------------------
    # 8. Write reconstruction_report.json
    # ------------------------------------------------------------------
    passed = (recovered == 252) and (len(missing) == 0)
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "filter": source_root_filter,
        "manifest_path": str(manifest_path),
        "image_root": str(image_root),
        "output_dir": str(output_dir),
        "selected_rows": len(deduped),
        "recovered_pairs": recovered,
        "missing_count": len(missing),
        "missing": missing,
        "passed": passed,
    }
    recon_report_path = output_dir / "reconstruction_report.json"
    recon_report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"Reconstruction report:   {recon_report_path}")
    print()
    print(f"=== SUMMARY ===")
    print(f"  selected_rows:   {report['selected_rows']}")
    print(f"  recovered_pairs: {report['recovered_pairs']}")
    print(f"  missing_count:   {report['missing_count']}")
    print(f"  passed:          {report['passed']}")

    if not passed:
        print()
        if recovered != 252:
            print(f"FAIL: expected recovered_pairs=252, got {recovered}", file=sys.stderr)
        if missing:
            print(f"FAIL: {len(missing)} missing files", file=sys.stderr)
        sys.exit(1)
    else:
        print()
        print("PASS: all acceptance criteria met.")


if __name__ == "__main__":
    main()
