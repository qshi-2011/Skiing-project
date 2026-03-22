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

/** Get all drills for a given category. */
export function drillsByCategory(category: Drill['category']): Drill[] {
  return DRILLS.filter((d) => d.category === category)
}
