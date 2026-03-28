/**
 * Rule-based practice guidance.
 *
 * Maps coaching tips (by keyword matching on title/explanation) to concrete
 * practice drills. When the same coaching category recurs across multiple
 * recent runs, it surfaces as a priority practice area.
 */

import type { CoachingTip } from './analysis-summary'

export interface PracticeDrill {
  id: string
  title: string
  description: string
  /** Which coaching category this addresses */
  category: 'balance' | 'edging' | 'rhythm' | 'movement' | 'general'
  /** How important this drill is — higher = more urgent */
  priority: number
}

const PRACTICE_LOCALIZATION_ZH: Record<string, { title: string; description: string }> = {
  'single-leg-balance': {
    title: '单腿平衡停留',
    description: '下次滑之前，左右腿各单腿站立 30 秒。注意保持髋部水平，膝盖对准脚尖。',
  },
  'railroad-tracks': {
    title: '铁轨练习',
    description: '在缓坡上保持双板与髋同宽滑行，像两条平行铁轨，感受双脚均匀受力。',
  },
  'javelin-turns': {
    title: '标枪式转弯',
    description: '把雪杖水平握在胸前，做中弯时始终让“标枪”朝向坡下，训练上下身分离。',
  },
  'edge-lock-traverses': {
    title: '锁刃横滑',
    description: '先用上坡侧刃横向穿越，再换另一侧。感受雪板咬雪并保持干净线路，不要侧滑。',
  },
  'thousand-steps': {
    title: '千步练习',
    description: '转弯过程中做快速小步换脚，夸张地强化重心转移和对外脚的承重。',
  },
  'metronome-turns': {
    title: '节拍器转弯',
    description: '一边数“一二、一二”，一边在节拍点启动每个转弯。先从缓坡开始，再逐渐增加坡度。',
  },
  'garland-turns': {
    title: '花环转弯',
    description: '在落线两侧做一连串半弯，重点感受圆滑弧线，而不是快速甩转。',
  },
  'pole-on-shoulders': {
    title: '雪杖架肩练习',
    description: '把雪杖横放在肩后，转弯时尽量让雪杖始终朝向坡下。如果它跟着转，说明上半身转动过多。',
  },
  'active-pole-touch': {
    title: '主动点杖',
    description: '每个弯开始时做轻而明确的点杖，让它成为节奏提示而不是发力动作，同时保持双手向前且可见。',
  },
  'camera-setup': {
    title: '优化拍摄设置',
    description: '把相机固定在雪道侧方，尽量保证整趟滑行完整入镜并有充足光线。视频越清晰，反馈越可靠。',
  },
}

interface Rule {
  /** Keywords to match against tip title + explanation (case-insensitive) */
  keywords: string[]
  drill: PracticeDrill
}

const RULES: Rule[] = [
  // ── Balance & Stance ──
  {
    keywords: ['knee', 'symmetr', 'asymmetr', 'flexion', 'uneven'],
    drill: {
      id: 'single-leg-balance',
      title: 'Single-leg balance holds',
      description: 'Stand on one leg for 30s each side before your next run. Focus on keeping hips level and knee tracking over the toe.',
      category: 'balance',
      priority: 0,
    },
  },
  {
    keywords: ['stance', 'width', 'narrow', 'wide', 'feet'],
    drill: {
      id: 'railroad-tracks',
      title: 'Railroad tracks drill',
      description: 'Ski a gentle slope keeping both skis hip-width apart like railroad tracks. Feel equal pressure through both feet.',
      category: 'balance',
      priority: 0,
    },
  },
  {
    keywords: ['lean', 'inclination', 'angulat', 'tilt', 'upright'],
    drill: {
      id: 'javelin-turns',
      title: 'Javelin turns',
      description: 'Hold poles together horizontally at chest height. Make medium turns while keeping the "javelin" pointing downhill — trains proper upper/lower body separation.',
      category: 'balance',
      priority: 0,
    },
  },

  // ── Edging & Grip ──
  {
    keywords: ['edge', 'carv', 'grip', 'skid', 'slip'],
    drill: {
      id: 'edge-lock-traverses',
      title: 'Edge-lock traverses',
      description: 'Traverse across the slope on your uphill edges only, then switch. Feel the ski bite and hold a clean line without skidding.',
      category: 'edging',
      priority: 0,
    },
  },
  {
    keywords: ['pressure', 'weight', 'load', 'transfer', 'com', 'center of mass'],
    drill: {
      id: 'thousand-steps',
      title: '1000 steps drill',
      description: 'Make short, quick steps from ski to ski while turning. Exaggerates weight transfer and builds commitment to the outside ski.',
      category: 'edging',
      priority: 0,
    },
  },

  // ── Turn Rhythm & Shape ──
  {
    keywords: ['rhythm', 'timing', 'tempo', 'consistent', 'duration', 'drift'],
    drill: {
      id: 'metronome-turns',
      title: 'Metronome turns',
      description: 'Count "one-two, one-two" out loud and initiate each turn on the beat. Start on gentle terrain and progressively steepen.',
      category: 'rhythm',
      priority: 0,
    },
  },
  {
    keywords: ['smooth', 'choppy', 'transition', 'flow', 'arc'],
    drill: {
      id: 'garland-turns',
      title: 'Garland turns',
      description: 'Make a series of half-turns (garlands) across the fall line, focusing on a smooth, round arc shape rather than a quick pivot.',
      category: 'rhythm',
      priority: 0,
    },
  },

  // ── Movement & Timing ──
  {
    keywords: ['quiet', 'upper body', 'torso', 'shoulder', 'head', 'sway', 'rotation'],
    drill: {
      id: 'pole-on-shoulders',
      title: 'Pole-across-shoulders drill',
      description: 'Place a pole behind your neck across both shoulders. Make turns while keeping the pole pointing downhill — if it rotates, your upper body is turning too much.',
      category: 'movement',
      priority: 0,
    },
  },
  {
    keywords: ['pole plant', 'hand', 'arm', 'reach'],
    drill: {
      id: 'active-pole-touch',
      title: 'Active pole touch',
      description: 'Focus on a deliberate, light pole plant at the start of each turn. The touch should be a timing cue, not a push — keep hands forward and visible.',
      category: 'movement',
      priority: 0,
    },
  },

  // ── General / fallback ──
  {
    keywords: ['confidence', 'pose', 'capture', 'video', 'quality'],
    drill: {
      id: 'camera-setup',
      title: 'Improve your capture setup',
      description: 'Use a tripod or fixed mount at the side of the course. Ensure the full run is in frame with good lighting — better video = better coaching.',
      category: 'general',
      priority: -1,
    },
  },
]

/**
 * Given a coaching tip, find matching practice drills.
 */
function matchDrills(tip: CoachingTip): PracticeDrill[] {
  const text = `${tip.title} ${tip.explanation}`.toLowerCase()
  const matches: PracticeDrill[] = []

  for (const rule of RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      matches.push(rule.drill)
    }
  }

  return matches
}

/**
 * Analyse coaching tips from multiple recent runs to produce practice guidance.
 *
 * Tips that recur across runs get higher priority.
 * Returns deduplicated drills sorted by priority (recurring > single occurrence).
 */
export function buildPracticeGuidance(
  recentTipSets: CoachingTip[][],
): PracticeDrill[] {
  const drillCounts = new Map<string, { drill: PracticeDrill; count: number }>()

  for (const tips of recentTipSets) {
    // Track which drills are matched per run (avoid double-counting within one run)
    const seenInRun = new Set<string>()

    for (const tip of tips) {
      const drills = matchDrills(tip)
      for (const drill of drills) {
        if (seenInRun.has(drill.id)) continue
        seenInRun.add(drill.id)

        const existing = drillCounts.get(drill.id)
        if (existing) {
          existing.count++
        } else {
          drillCounts.set(drill.id, { drill, count: 1 })
        }
      }
    }
  }

  return [...drillCounts.values()]
    .sort((a, b) => {
      // Recurring drills first, then by base priority, then alphabetical
      if (b.count !== a.count) return b.count - a.count
      if (b.drill.priority !== a.drill.priority) return b.drill.priority - a.drill.priority
      return a.drill.title.localeCompare(b.drill.title)
    })
    .map(({ drill, count }) => ({
      ...drill,
      priority: count,
    }))
}

/**
 * Build a next-session coaching summary from recent tip patterns.
 * Returns a short headline and the top practice drills.
 */
export function buildNextSessionCard(
  recentTipSets: CoachingTip[][],
): { headline: string; drills: PracticeDrill[] } {
  const drills = buildPracticeGuidance(recentTipSets)

  if (!drills.length) {
    return {
      headline: 'Keep skiing and uploading — your practice plan builds as we see more of your technique.',
      drills: [],
    }
  }

  const recurring = drills.filter((d) => d.priority > 1)
  const topDrill = drills[0]

  let headline: string
  if (recurring.length >= 2) {
    headline = `Your recent runs keep flagging ${recurring[0].category} and ${recurring[1].category}. Focus your next session on these two areas.`
  } else if (recurring.length === 1) {
    headline = `${recurring[0].title} keeps coming up — make it your warm-up priority next time out.`
  } else {
    headline = `Try "${topDrill.title}" in your next session to work on ${topDrill.category}.`
  }

  return { headline, drills: drills.slice(0, 4) }
}

export function localizePracticeDrill(drill: PracticeDrill, lang: 'en' | 'zh'): PracticeDrill {
  if (lang !== 'zh') return drill

  const localized = PRACTICE_LOCALIZATION_ZH[drill.id]
  if (!localized) return drill

  return {
    ...drill,
    title: localized.title,
    description: localized.description,
  }
}
