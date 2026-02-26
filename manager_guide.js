const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, Header, Footer, LevelFormat, PageBreak
} = require('docx');
const fs = require('fs');

const C = {
  navy:    "1B3A5C",
  teal:    "0D7377",
  amber:   "E8A020",
  red:     "C0392B",
  blue:    "2980B9",
  green:   "27AE60",
  purple:  "8E44AD",
  gray:    "7F8C8D",
  lightBg: "F4F7FA",
  altRow:  "EAF4FB",
  white:   "FFFFFF",
  black:   "1A1A1A",
};

const thin   = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const allB   = { top: thin, bottom: thin, left: thin, right: thin };
const noB    = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBs   = { top: noB, bottom: noB, left: noB, right: noB };

const sp   = (b, a) => ({ spacing: { before: b, after: a } });
const bold = (t, c, s) => new TextRun({ text: t, bold: true, color: c||C.black, size: s||24, font: "Arial" });
const reg  = (t, c, s) => new TextRun({ text: t, color: c||C.black, size: s||24, font: "Arial" });
const ital = (t, c)    => new TextRun({ text: t, italics: true, color: c||C.gray, size: 22, font: "Arial" });
const mono = (t)       => new TextRun({ text: t, font: "Courier New", size: 20, color: C.navy });

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, font: "Arial", bold: true, size: 36, color: C.navy })],
    ...sp(400, 160),
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.teal, space: 4 } },
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, font: "Arial", bold: true, size: 28, color: C.teal })],
    ...sp(280, 100),
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text, font: "Arial", bold: true, size: 24, color: C.navy })],
    ...sp(180, 80),
  });
}
function para(runs, opts={}) {
  const arr = Array.isArray(runs) ? runs : [reg(runs)];
  return new Paragraph({ children: arr, ...sp(0, 120), ...opts });
}
function bullet(runs, level=0) {
  const arr = Array.isArray(runs) ? runs : [reg(runs)];
  return new Paragraph({ numbering: { reference: "bullets", level }, children: arr, ...sp(0, 80) });
}
function numbered(runs, ref="steps") {
  const arr = Array.isArray(runs) ? runs : [reg(runs)];
  return new Paragraph({ numbering: { reference: ref, level: 0 }, children: arr, ...sp(0, 100) });
}
function callout(runs, fill) {
  const arr = Array.isArray(runs) ? runs : [reg(runs)];
  return new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      borders: noBs, shading: { fill, type: ShadingType.CLEAR },
      width: { size: 9360, type: WidthType.DXA },
      margins: { top: 120, bottom: 120, left: 200, right: 200 },
      children: [new Paragraph({ children: arr, ...sp(0,0) })],
    })] })],
  });
}
function rule() {
  return new Paragraph({
    children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD", space: 2 } },
    ...sp(140, 140),
  });
}
function gap(n=80) { return new Paragraph({ children: [], spacing: { before: n, after: n } }); }
function tc(runs, w, fill=C.white, align=AlignmentType.LEFT) {
  const arr = Array.isArray(runs) ? runs : [reg(runs)];
  return new TableCell({
    borders: allB, shading: { fill, type: ShadingType.CLEAR },
    width: { size: w, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: align, children: arr })],
  });
}

// ─────────────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
      ]},
      { reference: "steps", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      ]},
      { reference: "steps2", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      ]},
    ],
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 24, color: C.black } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Arial", size: 36, bold: true, color: C.navy },
        paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Arial", size: 28, bold: true, color: C.teal },
        paragraph: { spacing: { before: 280, after: 100 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Arial", size: 24, bold: true, color: C.navy },
        paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2 } },
    ],
  },

  sections: [{
    properties: {
      page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        children: [bold("Manager\u2019s Codex Deployment Guide  ", C.navy, 20), reg("v2.1 Parallel Execution", C.gray, 18)],
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.teal, space: 4 } },
        spacing: { before: 0, after: 120 },
      })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        children: [reg("Confidential \u2014 Manager Use Only  |  Page ", C.gray, 18),
          new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: C.gray })],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD", space: 4 } },
        spacing: { before: 120, after: 0 },
      })] }),
    },

    children: [

      // ── TITLE ──────────────────────────────────────────────
      gap(500),
      new Paragraph({
        children: [bold("Manager\u2019s Codex Deployment Guide", C.navy, 52)],
        alignment: AlignmentType.CENTER, spacing: { before: 0, after: 160 },
      }),
      new Paragraph({
        children: [bold("Alpine Skiing Gate Tracker \u2014 v2.1 Parallel Execution", C.teal, 32)],
        alignment: AlignmentType.CENTER, spacing: { before: 0, after: 240 },
      }),
      new Paragraph({
        children: [reg("For: Quan Shi (Manager)  |  February 2026", C.gray, 22)],
        alignment: AlignmentType.CENTER, spacing: { before: 0, after: 80 },
      }),
      new Paragraph({
        children: [ital("This document tells you exactly which Codex to spin up, what prompt to give it, and when.", C.teal)],
        alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 },
      }),
      gap(500),
      new Paragraph({ children: [new PageBreak()] }),

      // ── SEC 1: HOW CODEX WORKS ─────────────────────────────
      h1("1. How to Set Up a Codex Worker"),
      para([reg("Each worker is a separate Codex environment pointed at the same GitHub repository. They all read from the full project root but write only to their own track folder. Here is how to create one:")]),
      gap(60),
      numbered([bold("Create a new Codex environment "), reg("at codex.openai.com (or your Codex access point). Give it a name matching the track, e.g. \u201Ctrack-a-eval\u201D.")]),
      numbered([bold("Connect the repository: "), reg("Point the Codex environment at your GitHub repo ("), mono("github.com/<your-org>/Stanford-application-project"), reg("). Codex will clone the full project root.")]),
      numbered([bold("Open the track\u2019s CODEX_PROMPT.md: "), reg("Navigate to the track folder (e.g. "), mono("tracks/A_eval_harness/CODEX_PROMPT.md"), reg(") and copy the entire contents.")]),
      numbered([bold("Paste into the Codex thread: "), reg("In the Codex chat window, paste the full prompt text. Codex will read the repo, understand its role, and begin executing.")]),
      numbered([bold("Let it run: "), reg("Codex works autonomously. Check back at the manager checkpoints defined in Section 3.")]),
      gap(),
      callout([bold("Critical rule: ", C.navy), reg("One Codex environment per track. Never give two different track prompts to the same environment \u2014 they will conflict on file writes.")], "FFF8E7"),
      gap(),

      // ── SEC 2: WAVE-BY-WAVE DEPLOYMENT ────────────────────
      h1("2. Wave-by-Wave Deployment Instructions"),
      para([reg("Deploy workers in waves. "), bold("Do not start a new wave until the previous wave\u2019s checkpoints are passed."), reg(" Within a wave, spin up all workers simultaneously.")]),

      // WAVE 1
      h2("Wave 1 \u2014 The Blocker (1 Codex, start immediately)"),
      callout([bold("Start this now. Nothing else can begin until Wave 1 is done.", C.red)], "FDECEA"),
      gap(60),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [1800, 2400, 2160, 3000],
        rows: [
          new TableRow({ children: [
            tc([bold("Codex Name", C.white)], 1800, C.navy),
            tc([bold("Prompt File", C.white)], 2400, C.navy),
            tc([bold("Est. Duration", C.white)], 2160, C.navy),
            tc([bold("Done When\u2026", C.white)], 3000, C.navy),
          ]}),
          new TableRow({ children: [
            tc([bold("track-a-eval", C.teal)], 1800, C.lightBg),
            tc([mono("tracks/A_eval_harness/CODEX_PROMPT.md")], 2400, C.lightBg),
            tc([reg("4\u20136 hours")], 2160, C.lightBg, AlignmentType.CENTER),
            tc([reg("Sidecar JSON exists for \u22651 clip and validates against schema. Signal manager.")], 3000, C.lightBg),
          ]}),
        ],
      }),
      gap(80),
      para([bold("Your action after Wave 1: "), reg("Open one sidecar JSON from "), mono("tracks/A_eval_harness/sidecars/"), reg(" and verify it has non-uniform "), mono("delta_t_s"), reg(" values (not 1/fps repeated) and a valid "), mono("readout_time_ms"), reg(" field. If it looks correct, release Wave 2.")]),
      gap(),

      // WAVE 2
      h2("Wave 2 \u2014 Perception (2 Codex, run in parallel)"),
      callout([bold("Before starting: ", C.navy), reg("Send both workers a message telling them to coordinate "), mono("INTERFACE_AGREEMENT.md"), reg(" with each other first. Give them each other\u2019s track prompt file path. They must agree on the VP_t coordinate system before writing any code.")], "EAF4FB"),
      gap(60),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [1800, 2600, 1760, 3200],
        rows: [
          new TableRow({ children: [
            tc([bold("Codex Name", C.white)], 1800, C.navy),
            tc([bold("Prompt File", C.white)], 2600, C.navy),
            tc([bold("Est. Duration", C.white)], 1760, C.navy),
            tc([bold("Done When\u2026", C.white)], 3200, C.navy),
          ]}),
          new TableRow({ children: [
            tc([bold("track-c-bev", C.teal)], 1800, C.lightBg),
            tc([mono("tracks/C_bev_egomotion/CODEX_PROMPT.md")], 2600, C.lightBg),
            tc([reg("6\u20138 hours")], 1760, C.lightBg, AlignmentType.CENTER),
            tc([reg("BEV JSONs written + INTERFACE_AGREEMENT.md exists + 3 acceptance tests pass.")], 3200, C.lightBg),
          ]}),
          new TableRow({ children: [
            tc([bold("track-b-pose", C.teal)], 1800, C.white),
            tc([mono("tracks/B_model_retraining/CODEX_PROMPT_V2.md")], 2600, C.white),
            tc([reg("8\u201312 hours")], 1760, C.white, AlignmentType.CENTER),
            tc([reg("Detection JSONs written + 3-tier fallback ablation report shows Tier 2 < Tier 3 jitter.")], 3200, C.white),
          ]}),
        ],
      }),
      gap(80),
      para([bold("Your action after Wave 2: "), reg("Check that "), mono("tracks/C_bev_egomotion/INTERFACE_AGREEMENT.md"), reg(" exists and is referenced by both workers. Spot-check one BEV JSON and one detections JSON against their schemas. Release Wave 3.")]),
      gap(),

      // WAVE 3
      h2("Wave 3 \u2014 Tracking & Safety Scaffold (2 Codex, run in parallel)"),
      gap(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [1800, 2700, 1760, 3100],
        rows: [
          new TableRow({ children: [
            tc([bold("Codex Name", C.white)], 1800, C.navy),
            tc([bold("Prompt File", C.white)], 2700, C.navy),
            tc([bold("Est. Duration", C.white)], 1760, C.navy),
            tc([bold("Done When\u2026", C.white)], 3100, C.navy),
          ]}),
          new TableRow({ children: [
            tc([bold("track-d-kalman", C.blue)], 1800, C.lightBg),
            tc([mono("tracks/D_tracking_outlier/CODEX_PROMPT_V2.md")], 2700, C.lightBg),
            tc([reg("6\u20138 hours")], 1760, C.lightBg, AlignmentType.CENTER),
            tc([reg("Track JSONs written. VFR delta_t verification report confirms non-uniform timestamps. 0 ID switches on regression clips.")], 3100, C.lightBg),
          ]}),
          new TableRow({ children: [
            tc([bold("track-e-safety", C.blue)], 1800, C.white),
            tc([mono("tracks/E_degraded_safety/CODEX_PROMPT.md"), reg(" (Wave 3 sections only)")], 2700, C.white),
            tc([reg("4\u20135 hours")], 1760, C.white, AlignmentType.CENTER),
            tc([reg("3 automated pytest tests pass. SafetyMonitor integrates into pipeline.py with no errors.")], 3100, C.white),
          ]}),
        ],
      }),
      gap(80),
      para([bold("Your action after Wave 3: "), reg("Run "), mono("pytest tracks/E_degraded_safety/tests/"), reg(" and confirm 3 tests pass. Check track-d-kalman\u2019s VFR report. Release Wave 4.")]),
      gap(),

      // WAVE 4
      h2("Wave 4 \u2014 Sequence Logic & Calibration (3 Codex in parallel, then 1 last)"),
      callout([bold("Before starting: ", C.navy), reg("Tell track-f-viterbi and track-e-safety to agree on the S* output API ("), mono("tracks/F_viterbi_decoder/DECODER_API.md"), reg(") before either writes any integration code.")], "EAF4FB"),
      gap(60),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [1800, 2700, 1560, 3300],
        rows: [
          new TableRow({ children: [
            tc([bold("Codex Name", C.white)], 1800, C.navy),
            tc([bold("Prompt File", C.white)], 2700, C.navy),
            tc([bold("Est. Duration", C.white)], 1560, C.navy),
            tc([bold("Done When\u2026", C.white)], 3300, C.navy),
          ]}),
          new TableRow({ children: [
            tc([bold("track-f-viterbi", C.purple)], 1800, C.lightBg),
            tc([mono("tracks/F_viterbi_decoder/CODEX_PROMPT.md")], 2700, C.lightBg),
            tc([reg("6\u20138 hours")], 1560, C.lightBg, AlignmentType.CENTER),
            tc([reg("4 synthetic tests pass. DNF absorbing. Log-space: no NaN/inf. DECODER_API.md written.")], 3300, C.lightBg),
          ]}),
          new TableRow({ children: [
            tc([bold("track-g-init", C.purple)], 1800, C.white),
            tc([mono("tracks/G_initialisation/CODEX_PROMPT.md")], 2700, C.white),
            tc([reg("5\u20137 hours")], 1560, C.white, AlignmentType.CENTER),
            tc([reg("4 pytest tests pass. No detector re-call during retroactive pass confirmed.")], 3300, C.white),
          ]}),
          new TableRow({ children: [
            tc([bold("track-e-safety", C.purple), reg(" (Wave 4)")], 1800, C.lightBg),
            tc([mono("tracks/E_degraded_safety/CODEX_PROMPT.md"), reg(" (Wave 4 sections)"), reg("\n\nStart only after DECODER_API.md exists")], 2700, C.lightBg),
            tc([reg("2\u20133 hours")], 1560, C.lightBg, AlignmentType.CENTER),
            tc([reg("4th pytest test passes. S* collapse trigger wired into SafetyMonitor.")], 3300, C.lightBg),
          ]}),
          new TableRow({ children: [
            tc([bold("track-h-calibrate", C.purple)], 1800, C.white),
            tc([mono("tracks/H_calibration/CODEX_PROMPT.md"), reg("\n\nStart only after F + G + E(W4) all pass")], 2700, C.white),
            tc([reg("8\u201312 hours")], 1560, C.white, AlignmentType.CENTER),
            tc([reg("All TBDs in tracker_spec_v2.docx \u00a77 have values + CIs. configs/tracker_v2_calibrated.yaml written.")], 3300, C.white),
          ]}),
        ],
      }),
      gap(80),
      para([bold("Your action after Wave 4: "), reg("Run the full metric harness on the calibrated pipeline. IDF1 and HOTA should exceed the dummy baseline. Review "), mono("configs/tracker_v2_calibrated.yaml"), reg(" and confirm no TBDs remain. Project complete.")]),
      gap(),
      new Paragraph({ children: [new PageBreak()] }),

      // ── SEC 3: MANAGER CHECKPOINTS ─────────────────────────
      h1("3. Manager Checkpoint Checklist"),
      para([reg("At each wave boundary, run through this checklist before releasing the next wave. Do not approve a wave just because the worker says it is done.")]),
      gap(80),

      // Wave 1 checkpoint
      h3("After Wave 1"),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [600, 7560, 1200],
        rows: [
          new TableRow({ children: [tc([bold("\u2713", C.white)], 600, C.navy, AlignmentType.CENTER), tc([bold("Check", C.white)], 7560, C.navy), tc([bold("Result", C.white)], 1200, C.navy, AlignmentType.CENTER)] }),
          ...[
            ["Open any sidecar JSON. Confirm delta_t_s values are NOT all identical (i.e., VFR is captured, not 1/fps repeated)."],
            ["Confirm no slow-motion clip (fps \u2265 120) appears in eval_split.json."],
            ["Run the dummy baseline harness. Confirm it produces a non-zero, non-crashing report."],
            ["Confirm eval_split.json has \u22658 clips across all four condition dimensions."],
          ].map((c, i) => new TableRow({ children: [
            tc([reg("\u25A1")], 600, i%2===0?C.lightBg:C.white, AlignmentType.CENTER),
            tc([reg(c[0])], 7560, i%2===0?C.lightBg:C.white),
            tc([reg("Pass / Fail")], 1200, i%2===0?C.lightBg:C.white, AlignmentType.CENTER),
          ]})),
        ],
      }),
      gap(),

      // Wave 2 checkpoint
      h3("After Wave 2"),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [600, 7560, 1200],
        rows: [
          new TableRow({ children: [tc([bold("\u2713", C.white)], 600, C.navy, AlignmentType.CENTER), tc([bold("Check", C.white)], 7560, C.navy), tc([bold("Result", C.white)], 1200, C.navy, AlignmentType.CENTER)] }),
          ...[
            ["INTERFACE_AGREEMENT.md exists in tracks/C_bev_egomotion/ and mentions both Track B and Track C."],
            ["Open one BEV JSON. Validate against shared/interfaces/per_frame_bev.schema.json (python -c \"import jsonschema...\")."],
            ["Open one detections JSON. Validate against shared/interfaces/per_frame_detections.schema.json."],
            ["Ablation report exists in tracks/B_model_retraining/reports/ showing Tier 2 jitter < Tier 3 jitter on at least one occluded-base clip."],
            ["All emission_log_prob values in detections JSON are <= 0."],
          ].map((c, i) => new TableRow({ children: [
            tc([reg("\u25A1")], 600, i%2===0?C.lightBg:C.white, AlignmentType.CENTER),
            tc([reg(c[0])], 7560, i%2===0?C.lightBg:C.white),
            tc([reg("Pass / Fail")], 1200, i%2===0?C.lightBg:C.white, AlignmentType.CENTER),
          ]})),
        ],
      }),
      gap(),

      // Wave 3 checkpoint
      h3("After Wave 3"),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [600, 7560, 1200],
        rows: [
          new TableRow({ children: [tc([bold("\u2713", C.white)], 600, C.navy, AlignmentType.CENTER), tc([bold("Check", C.white)], 7560, C.navy), tc([bold("Result", C.white)], 1200, C.navy, AlignmentType.CENTER)] }),
          ...[
            ["Run: pytest tracks/E_degraded_safety/tests/ \u2014 all 3 tests must pass."],
            ["VFR verification report in tracks/D_tracking_outlier/reports/ confirms non-uniform delta_t usage."],
            ["Track JSONs exist for all eval split clips. ID switches = 0 on regression clips."],
            ["SafetyMonitor imports cleanly from ski_racing/safety.py with no errors."],
          ].map((c, i) => new TableRow({ children: [
            tc([reg("\u25A1")], 600, i%2===0?C.lightBg:C.white, AlignmentType.CENTER),
            tc([reg(c[0])], 7560, i%2===0?C.lightBg:C.white),
            tc([reg("Pass / Fail")], 1200, i%2===0?C.lightBg:C.white, AlignmentType.CENTER),
          ]})),
        ],
      }),
      gap(),

      // Wave 4 checkpoint
      h3("After Wave 4 (F + G + E integration, before releasing H)"),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [600, 7560, 1200],
        rows: [
          new TableRow({ children: [tc([bold("\u2713", C.white)], 600, C.navy, AlignmentType.CENTER), tc([bold("Check", C.white)], 7560, C.navy), tc([bold("Result", C.white)], 1200, C.navy, AlignmentType.CENTER)] }),
          ...[
            ["DECODER_API.md exists in tracks/F_viterbi_decoder/ and is referenced in tracks/E_degraded_safety/CODEX_PROMPT.md."],
            ["Run: pytest tracks/F_viterbi_decoder/ \u2014 DNF absorbing test, short-sequence test, log-space test all pass."],
            ["Run: pytest tracks/G_initialisation/tests/ \u2014 all 4 tests pass including no-detector-recall test."],
            ["Run: pytest tracks/E_degraded_safety/tests/ \u2014 all 4 tests pass (including Test 4: S* collapse trigger)."],
            ["Run the full end-to-end pipeline on one eval clip. No crashes. Flags emitted correctly."],
          ].map((c, i) => new TableRow({ children: [
            tc([reg("\u25A1")], 600, i%2===0?C.lightBg:C.white, AlignmentType.CENTER),
            tc([reg(c[0])], 7560, i%2===0?C.lightBg:C.white),
            tc([reg("Pass / Fail")], 1200, i%2===0?C.lightBg:C.white, AlignmentType.CENTER),
          ]})),
        ],
      }),
      gap(),

      // Final checkpoint
      h3("After Wave 4 (H calibration \u2014 final)"),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [600, 7560, 1200],
        rows: [
          new TableRow({ children: [tc([bold("\u2713", C.white)], 600, C.navy, AlignmentType.CENTER), tc([bold("Check", C.white)], 7560, C.navy), tc([bold("Result", C.white)], 1200, C.navy, AlignmentType.CENTER)] }),
          ...[
            ["Open tracker_spec_v2.docx Section 7. Every \u201CTBD\u201D row must have a corresponding entry with CI in calibration_summary_YYYYMMDD.md."],
            ["configs/tracker_v2_calibrated.yaml exists and is valid YAML (python -c \"import yaml; yaml.safe_load(open('configs/tracker_v2_calibrated.yaml'))\")."],
            ["Rolling shutter \u03b8 is NOT listed as a learned parameter in the calibrated config."],
            ["Calibrated pipeline IDF1 \u2265 dummy baseline IDF1 from tracks/A_eval_harness/reports/baseline_dummy.json."],
            ["shared/docs/MODEL_REGISTRY.md has been updated with the calibration run entry."],
          ].map((c, i) => new TableRow({ children: [
            tc([reg("\u25A1")], 600, i%2===0?C.lightBg:C.white, AlignmentType.CENTER),
            tc([reg(c[0])], 7560, i%2===0?C.lightBg:C.white),
            tc([reg("Pass / Fail")], 1200, i%2===0?C.lightBg:C.white, AlignmentType.CENTER),
          ]})),
        ],
      }),
      gap(),
      new Paragraph({ children: [new PageBreak()] }),

      // ── SEC 4: PROMPT QUICK REFERENCE ─────────────────────
      h1("4. Prompt Quick Reference"),
      para([reg("Copy the exact text below to add context when spinning up each Codex. Paste this "), bold("before"), reg(" the contents of the CODEX_PROMPT.md file.")]),
      gap(80),

      h2("Preamble to paste before every prompt"),
      callout([
        bold("You are a Codex worker on the Alpine Ski Racing Gate Tracker project (v2.1).\n", C.navy),
        reg("The full project is at the root of this repository.\n"),
        reg("Before doing anything else:\n"),
        reg("1. Read tracks/README.md to understand the overall architecture.\n"),
        reg("2. Read the interface schemas in shared/interfaces/ that your README references.\n"),
        reg("3. Read tracker_spec_v2.docx for the full mathematical specification.\n"),
        reg("4. Then read your specific track prompt below.\n\n"),
        bold("Golden rule: ", C.red), reg("You may READ from anywhere. You may WRITE only to your own track folder and the shared resources listed in your README. Never edit another track\u2019s files without manager approval."),
      ], "F4F7FA"),
      gap(),

      h2("Track-to-Codex Name Mapping"),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [1600, 1800, 2400, 3560],
        rows: [
          new TableRow({ children: [
            tc([bold("Wave", C.white)], 1600, C.navy, AlignmentType.CENTER),
            tc([bold("Codex Name", C.white)], 1800, C.navy),
            tc([bold("Prompt File", C.white)], 2400, C.navy),
            tc([bold("Key Coordination", C.white)], 3560, C.navy),
          ]}),
          ...[
            ["W1", "track-a-eval",    "tracks/A_eval_harness/CODEX_PROMPT.md",           "Signal manager when first sidecar JSON is ready", C.navy],
            ["W2", "track-c-bev",     "tracks/C_bev_egomotion/CODEX_PROMPT.md",           "Write INTERFACE_AGREEMENT.md with track-b-pose first", C.teal],
            ["W2", "track-b-pose",    "tracks/B_model_retraining/CODEX_PROMPT_V2.md",     "Sign INTERFACE_AGREEMENT.md with track-c-bev first", C.teal],
            ["W3", "track-d-kalman",  "tracks/D_tracking_outlier/CODEX_PROMPT_V2.md",     "Consume C outputs. Write VFR verification report.", C.blue],
            ["W3", "track-e-safety",  "tracks/E_degraded_safety/CODEX_PROMPT.md (W3)",    "Build scaffold only. Wire S* in Wave 4.", C.blue],
            ["W4", "track-f-viterbi", "tracks/F_viterbi_decoder/CODEX_PROMPT.md",         "Write DECODER_API.md with track-e-safety first", C.purple],
            ["W4", "track-g-init",    "tracks/G_initialisation/CODEX_PROMPT.md",           "Read DECODER_API.md before implementing", C.purple],
            ["W4", "track-e-safety",  "tracks/E_degraded_safety/CODEX_PROMPT.md (W4)",    "Only after DECODER_API.md exists", C.purple],
            ["W4\u2192", "track-h-calibrate", "tracks/H_calibration/CODEX_PROMPT.md",    "Only after F+G+E(W4) all pass", C.purple],
          ].map(([w, name, prompt, coord, col], i) => new TableRow({ children: [
            tc([bold(w, C.white)], 1600, col, AlignmentType.CENTER),
            tc([bold(name, C.teal)], 1800, i%2===0?C.lightBg:C.white),
            tc([mono(prompt)], 2400, i%2===0?C.lightBg:C.white),
            tc([ital(coord)], 3560, i%2===0?C.lightBg:C.white),
          ]})),
        ],
      }),
      gap(),
      rule(),

      // ── SEC 5: TROUBLE SHOOTING ────────────────────────────
      h1("5. Common Problems & Fixes"),

      h3("A worker says it\u2019s done but the acceptance tests fail"),
      para([reg("Do not advance the wave. Tell the worker: \u201CYour acceptance tests are not passing. Specifically, [state which test is failing]. Fix this before I release Wave N+1.\u201D Workers sometimes declare done prematurely when they have written the code but not run the tests.")]),

      h3("Two workers produce incompatible output formats"),
      para([reg("This means the interface contract was not locked in writing before coding started. Go to "), mono("shared/interfaces/"), reg(" and check if the relevant schema was modified by either worker. If yes, restore it and require both workers to re-conform their outputs. The schemas are READ ONLY.")]),

      h3("A worker edits another track\u2019s files"),
      para([reg("Check git diff to identify which files were touched. Roll back the unauthorised changes. Remind both workers of the golden rule: write only to your own track folder.")]),

      h3("Wave 4 track-e-safety cannot find S* in the Viterbi output"),
      para([reg("This means DECODER_API.md was not agreed before Track F started writing output. Have track-f-viterbi open its output JSON and describe the exact field names. Have track-e-safety update its "), mono("update_with_decoder()"), reg(" method to match. This is the most likely integration collision point.")]),

      h3("Track H cannot calibrate EIS threshold \u2014 not enough annotated EIS-jump clips"),
      para([reg("This is expected for some parameters. Track H should document this as a data collection recommendation: \u201CRequires N additional clips with manually annotated EIS snap events.\u201D The threshold stays as the starting prior (50.0 pixels) until more data is available.")]),

      gap(),
      rule(),
      gap(200),
      new Paragraph({
        children: [ital("End of Manager\u2019s Guide. Good luck, Quan.")],
        alignment: AlignmentType.CENTER,
      }),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(
    "/sessions/zealous-vigilant-ritchie/mnt/Stanford application project/tracks/Manager_Codex_Deployment_Guide.docx",
    buf
  );
  console.log("Done.");
}).catch(e => { console.error(e); process.exit(1); });
