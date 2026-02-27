import { useWizardStore } from '../../store/wizardStore'
import { SelectionTile } from '../SelectionTile'
import { StepContainer } from '../StepContainer'
import type { EventCharacter, AudienceSize } from '../../types'

interface CharacterOption {
  value: EventCharacter
  label: string
  description: string
  icon: string
  minAudience?: AudienceSize
  maxAudience?: AudienceSize
  group: 'format' | 'context' | 'purpose'
}

// Group 1: Event Format (mutually exclusive)
// Group 2: Context/Setting (can combine with format)
// Group 3: Purpose/Goal (can combine with format)

const characterOptions: CharacterOption[] = [
  // FORMAT GROUP - Mutually exclusive
  {
    value: 'living_room_battle',
    label: 'Living Room Battle',
    description: 'Intimate home gathering with friends',
    icon: '🏠',
    maxAudience: 25,
    group: 'format'
  },
  {
    value: 'household_personal',
    label: 'Personal Celebration',
    description: 'Birthday, anniversary, or private party',
    icon: '🎉',
    maxAudience: 60,
    group: 'format'
  },
  {
    value: 'competitors_only',
    label: 'Competitors Only',
    description: 'No public audience - just artists competing',
    icon: '🎨',
    maxAudience: 25,
    group: 'format'
  },
  {
    value: 'one_night_showcase',
    label: 'One-Night Showcase',
    description: 'Single public event at a venue',
    icon: '✨',
    group: 'format'
  },
  {
    value: 'ongoing_series',
    label: 'Ongoing Series',
    description: 'Regular recurring events in your area',
    icon: '📅',
    group: 'format'
  },
  {
    value: 'seasonal_championship',
    label: 'Championship Arc',
    description: 'Multi-event competition with finals',
    icon: '🏆',
    minAudience: 60,
    group: 'format'
  },
  {
    value: 'festival_feature',
    label: 'Festival Feature',
    description: 'Part of a larger festival or conference',
    icon: '🎪',
    minAudience: 150,
    group: 'format'
  },
  // CONTEXT GROUP - Can combine with format
  {
    value: 'brand_activation',
    label: 'Brand Activation',
    description: 'Corporate sponsorship or marketing event',
    icon: '💼',
    minAudience: 60,
    group: 'context'
  },
  {
    value: 'educational_program',
    label: 'Educational Program',
    description: 'School, university, or learning institution',
    icon: '📚',
    group: 'context'
  },
  {
    value: 'institutional_program',
    label: 'Institutional Program',
    description: 'Museum, gallery, or cultural institution',
    icon: '🏛️',
    group: 'context'
  },
  // PURPOSE GROUP - Can combine with format
  {
    value: 'fundraiser',
    label: 'Fundraiser',
    description: 'Charity or cause-driven event',
    icon: '💝',
    group: 'purpose'
  },
  {
    value: 'experimental_format',
    label: 'Experimental Format',
    description: 'Something new and different',
    icon: '🔬',
    group: 'purpose'
  }
]

const formatOptions = characterOptions.filter(o => o.group === 'format')
const contextOptions = characterOptions.filter(o => o.group === 'context' || o.group === 'purpose')

export function CharacterStep() {
  const { intent, toggleEventCharacter, goToStep } = useWizardStore()

  const isOptionDisabled = (option: CharacterOption): boolean => {
    if (option.minAudience && intent.audienceMax < option.minAudience) return true
    if (option.maxAudience && intent.audienceMax > option.maxAudience) return true
    return false
  }

  // For format group, only allow one selection
  const handleFormatSelect = (value: EventCharacter) => {
    const currentFormats = intent.eventCharacterTags.filter(t =>
      formatOptions.some(o => o.value === t)
    )

    // If clicking the same one, deselect it
    if (currentFormats.includes(value)) {
      toggleEventCharacter(value)
    } else {
      // Remove any existing format selections first
      currentFormats.forEach(t => toggleEventCharacter(t))
      // Then add the new one
      toggleEventCharacter(value)
    }
  }

  const handleContinue = () => {
    if (intent.eventCharacterTags.length > 0) {
      goToStep('value_flows')
    }
  }

  return (
    <StepContainer
      title="What kind of Art Battle are you imagining?"
      subtitle="Choose your event format, then add any additional context."
      footer={
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-white/40 text-sm">
            {intent.eventCharacterTags.length === 0
              ? 'Select at least one option'
              : `${intent.eventCharacterTags.length} selected`}
          </p>
          <button
            onClick={handleContinue}
            disabled={intent.eventCharacterTags.length === 0}
            className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ab-crimson)] px-8 py-3 font-semibold text-white transition-all duration-200 hover:bg-[var(--ab-crimson-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Format section - mutually exclusive */}
        <div>
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-3">
            Event Format <span className="text-white/40">(choose one)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {formatOptions.map((option) => {
              const disabled = isOptionDisabled(option)
              const selected = intent.eventCharacterTags.includes(option.value)
              return (
                <SelectionTile
                  key={option.value}
                  selected={selected}
                  disabled={disabled}
                  onClick={() => handleFormatSelect(option.value)}
                >
                  <div className="pr-8">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{option.icon}</span>
                      <h3 className="text-base font-semibold text-white">
                        {option.label}
                      </h3>
                    </div>
                    <p className="text-white/60 text-sm">
                      {option.description}
                    </p>
                    {disabled && (
                      <p className="text-white/40 text-xs mt-1 italic">
                        {option.minAudience
                          ? `Requires ${option.minAudience}+ guests`
                          : `Max ${option.maxAudience} guests`}
                      </p>
                    )}
                  </div>
                </SelectionTile>
              )
            })}
          </div>
        </div>

        {/* Context section - can select multiple */}
        <div>
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-3">
            Additional Context <span className="text-white/40">(optional, select any that apply)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {contextOptions.map((option) => {
              const disabled = isOptionDisabled(option)
              const selected = intent.eventCharacterTags.includes(option.value)
              return (
                <SelectionTile
                  key={option.value}
                  selected={selected}
                  disabled={disabled}
                  onClick={() => toggleEventCharacter(option.value)}
                >
                  <div className="pr-8">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{option.icon}</span>
                      <h3 className="text-base font-semibold text-white">
                        {option.label}
                      </h3>
                    </div>
                    <p className="text-white/60 text-sm">
                      {option.description}
                    </p>
                    {disabled && (
                      <p className="text-white/40 text-xs mt-1 italic">
                        {option.minAudience
                          ? `Requires ${option.minAudience}+ guests`
                          : `Max ${option.maxAudience} guests`}
                      </p>
                    )}
                  </div>
                </SelectionTile>
              )
            })}
          </div>
        </div>
      </div>
    </StepContainer>
  )
}
