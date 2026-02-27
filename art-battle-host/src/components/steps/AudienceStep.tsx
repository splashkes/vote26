import { useWizardStore } from '../../store/wizardStore'
import { StepContainer } from '../StepContainer'
import type { AudienceSize } from '../../types'

const audienceSizes: { value: AudienceSize; label: string }[] = [
  { value: 5, label: '5' },
  { value: 25, label: '25' },
  { value: 60, label: '60' },
  { value: 150, label: '150' },
  { value: 400, label: '400' },
  { value: 1000, label: '1,000' },
  { value: 5000, label: '5,000+' }
]

export function AudienceStep() {
  const { intent, setAudienceMax, goToStep } = useWizardStore()

  const currentIndex = audienceSizes.findIndex(s => s.value === intent.audienceMax)
  const currentSize = audienceSizes[currentIndex]

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const index = parseInt(e.target.value, 10)
    setAudienceMax(audienceSizes[index].value)
  }

  const handleContinue = () => {
    goToStep('character')
  }

  // Get size description
  const getSizeDescription = (size: AudienceSize): string => {
    if (size <= 25) return 'Intimate gathering'
    if (size <= 60) return 'Small event'
    if (size <= 150) return 'Medium event'
    if (size <= 400) return 'Large event'
    if (size <= 1000) return 'Major event'
    return 'Festival scale'
  }

  return (
    <StepContainer
      title="How many people do you expect at most?"
      subtitle="This helps us understand your production and licensing needs."
      footer={
        <button
          onClick={handleContinue}
          className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ab-crimson)] px-8 py-3 font-semibold text-white transition-all duration-200 hover:bg-[var(--ab-crimson-dark)]"
        >
          Continue
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      }
    >
      <div className="space-y-8">
        {/* Current value display */}
        <div className="text-center py-8">
          <div className="text-6xl md:text-7xl font-bold text-white mb-2">
            {currentSize.label}
          </div>
          <div className="text-white/60 text-lg">
            {getSizeDescription(intent.audienceMax)}
          </div>
        </div>

        {/* Slider */}
        <div className="px-2">
          <input
            type="range"
            min={0}
            max={audienceSizes.length - 1}
            value={currentIndex}
            onChange={handleSliderChange}
            className="w-full"
          />

          {/* Labels */}
          <div className="flex justify-between mt-3 px-1">
            {audienceSizes.map((size, index) => (
              <span
                key={size.value}
                className={`text-xs transition-colors ${
                  index === currentIndex ? 'text-white font-medium' : 'text-white/40'
                }`}
              >
                {size.label}
              </span>
            ))}
          </div>
        </div>

        {/* Info box for large events */}
        {intent.audienceMax > 150 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-amber-200/80">
                Events with more than 150 guests typically require a custom production plan and consultation with our team.
              </div>
            </div>
          </div>
        )}
      </div>
    </StepContainer>
  )
}
