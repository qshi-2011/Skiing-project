/**
 * Curated drill library — 9 practice drills mapped to coaching categories.
 *
 * Each drill has a placeholder video path. Replace with actual hosted URLs
 * once you download and upload the reference videos.
 */

export interface Drill {
  id: string
  title: string
  description: string
  category: 'balance' | 'edging' | 'rhythm' | 'movement'
  /** Path to the practice video (hosted on R2 or public/) */
  videoUrl: string | null
}

const DRILL_LOCALIZATION_ZH: Record<string, { title: string; description: string }> = {
  'traverse-outside-ski': {
    title: '外脚单板横滑',
    description: '横向穿越雪坡时，专注把重心稳定压在外脚上，感受整只脚底持续受力。',
  },
  'equal-rhythm-turns': {
    title: '等节奏转弯',
    description: '在绿道或简单蓝道做大而慢的转弯，尽量保持左右节奏一致，可以边滑边数拍子。',
  },
  'hockey-stops': {
    title: '双侧冰球式急停',
    description: '左右两边都练习急停，直到你能快速且干净地停住，建立更对称的立刃信心。',
  },
  'hands-forward-quiet-poles': {
    title: '双手向前，雪杖安静',
    description: '滑行时双手保持在身体前方，雪杖动作尽量安静，练习更稳定的上半身位置。可以想象自己端着一个托盘。',
  },
  'inside-ski-lift': {
    title: '转弯时抬起内侧滑雪板',
    description: '转弯时轻轻抬起内侧滑雪板，训练把压力更明确地压到外脚上。先从缓坡开始，再逐步到更陡地形。',
  },
  'short-turns-corridor': {
    title: '走廊短弯',
    description: '在一个较窄的“走廊”里做短弯，提升换刃速度和转弯效率。可以在雪面上选两条线作为边界。',
  },
  'no-poles-balance': {
    title: '不拿雪杖滑行',
    description: '在平缓雪道上不拿雪杖滑一段，强化平衡和下半身转向控制。双手自然放在身体两侧或大腿上。',
  },
  'side-slip-falling-leaf': {
    title: '侧滑与落叶练习',
    description: '练习侧滑和落叶动作来建立立刃控制。逐步变化速度和滑动方向。',
  },
  'hold-finish-pause': {
    title: '弯尾停顿',
    description: '每个弯结束时先停顿并保持平衡姿态，再开始下一个弯，感受重量最终落点。',
  },
}

export const DRILLS: Drill[] = [
  {
    id: 'traverse-outside-ski',
    title: 'Traverse on outside ski',
    description:
      'Traverse across the slope and focus on staying balanced over the outside ski. Feel the pressure build through the whole foot.',
    category: 'balance',
    videoUrl: null, // TODO: add video
  },
  {
    id: 'equal-rhythm-turns',
    title: 'Equal rhythm turns',
    description:
      'Make large slow turns on a green or easy blue run, aiming for equal rhythm left and right. Count each turn to keep them even.',
    category: 'rhythm',
    videoUrl: null,
  },
  {
    id: 'hockey-stops',
    title: 'Hockey stops both sides',
    description:
      'Do hockey stops on both sides until you can stop quickly and cleanly either way. This builds symmetric edge confidence.',
    category: 'edging',
    videoUrl: null,
  },
  {
    id: 'hands-forward-quiet-poles',
    title: 'Hands forward, quiet poles',
    description:
      'Ski with your hands forward and poles quiet to practice stable upper-body position. Imagine holding a tray in front of you.',
    category: 'movement',
    videoUrl: null,
  },
  {
    id: 'inside-ski-lift',
    title: 'Lift inside ski in turns',
    description:
      'Lift the inside ski slightly during turns to train pressure on the outside ski. Start gentle and progress to steeper terrain.',
    category: 'balance',
    videoUrl: null,
  },
  {
    id: 'short-turns-corridor',
    title: 'Short turns in a corridor',
    description:
      'Make short turns in a narrow corridor to improve edge changes and turning speed. Pick two lines on the snow as your boundaries.',
    category: 'edging',
    videoUrl: null,
  },
  {
    id: 'no-poles-balance',
    title: 'Ski without poles',
    description:
      'Ski a gentle run without poles to sharpen balance and lower-body steering. Hands stay relaxed at your sides or on your thighs.',
    category: 'balance',
    videoUrl: null,
  },
  {
    id: 'side-slip-falling-leaf',
    title: 'Side-slip & falling leaf',
    description:
      'Practice side-slipping and falling-leaf drills to build edge control. Gradually vary the speed and direction of the slip.',
    category: 'edging',
    videoUrl: null,
  },
  {
    id: 'hold-finish-pause',
    title: 'Pause at turn finish',
    description:
      'Pause at the end of each turn and hold the balanced finish position before starting the next one. Feel where your weight sits.',
    category: 'balance',
    videoUrl: null,
  },
]

/** Look up a drill by ID. Returns undefined if not found. */
export function getDrill(id: string): Drill | undefined {
  return DRILLS.find((d) => d.id === id)
}

export function localizeDrill(drill: Drill, lang: 'en' | 'zh'): Drill {
  if (lang !== 'zh') return drill

  const localized = DRILL_LOCALIZATION_ZH[drill.id]
  if (!localized) return drill

  return {
    ...drill,
    title: localized.title,
    description: localized.description,
  }
}

/** Get all drills for a given category. */
export function drillsByCategory(category: Drill['category']): Drill[] {
  return DRILLS.filter((d) => d.category === category)
}
