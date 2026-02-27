import { useWizardStore } from '../../store/wizardStore'
import { SelectionTile } from '../SelectionTile'
import { StepContainer } from '../StepContainer'
import type { AccessMode } from '../../types'

const accessOptions: { value: AccessMode; label: string; description: string }[] = [
  {
    value: 'public',
    label: 'Public',
    description: 'Anyone can attend. Your event will be fully listed and open to all.'
  },
  {
    value: 'semi_private',
    label: 'Semi-Private',
    description: 'Restricted to a specific group - students, members, or invite list.'
  },
  {
    value: 'private',
    label: 'Private',
    description: 'Closed or commissioned event for a specific organization or occasion.'
  }
]

export function AccessStep() {
  const { intent, setAccessMode, goToStep } = useWizardStore()

  const handleSelect = (mode: AccessMode) => {
    setAccessMode(mode)
  }

  const handleContinue = () => {
    if (intent.accessMode) {
      goToStep('attendance')
    }
  }

  return (
    <StepContainer
      title="Who will this event be open to?"
      subtitle="This helps us understand your audience and licensing needs."
      footer={
        <button
          onClick={handleContinue}
          disabled={!intent.accessMode}
          className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ab-crimson)] px-8 py-3 font-semibold text-white transition-all duration-200 hover:bg-[var(--ab-crimson-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      }
    >
      <div className="space-y-4">
        {accessOptions.map((option) => (
          <SelectionTile
            key={option.value}
            selected={intent.accessMode === option.value}
            onClick={() => handleSelect(option.value)}
          >
            <div className="pr-8">
              <h3 className="text-lg font-semibold text-white mb-1">
                {option.label}
              </h3>
              <p className="text-white/60 text-sm">
                {option.description}
              </p>
            </div>
          </SelectionTile>
        ))}
      </div>
    </StepContainer>
  )
}
