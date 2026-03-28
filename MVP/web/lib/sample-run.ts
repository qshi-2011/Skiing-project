import type { AiCoaching, TechniqueRunSummary } from '@/lib/analysis-summary'
import type { Lang } from '@/lib/i18n'
import summaryJson from '@/lib/sample-data/summary.json'
import coachingEnJson from '@/lib/sample-data/ai-coaching.en.json'
import coachingZhJson from '@/lib/sample-data/ai-coaching.zh.json'

export const SAMPLE_SUMMARY = summaryJson as unknown as TechniqueRunSummary
export const SAMPLE_COACHING_EN = coachingEnJson as unknown as AiCoaching
export const SAMPLE_COACHING_ZH = coachingZhJson as unknown as AiCoaching
export const SAMPLE_OVERLAY_PATH = '/sample/overlay.mp4'

export function getSampleCoaching(lang: Lang): AiCoaching {
  return lang === 'zh' ? SAMPLE_COACHING_ZH : SAMPLE_COACHING_EN
}
