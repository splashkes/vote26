import { useWizardStore } from '../../store/wizardStore'
import { SelectionTile } from '../SelectionTile'
import { StepContainer } from '../StepContainer'
import type { ArtistRelationship } from '../../types'

interface RelationshipOption {
  value: ArtistRelationship
  label: string
  description: string
}

const relationshipOptions: RelationshipOption[] = [
  {
    value: 'pay_to_participate',
    label: 'Artists pay to participate',
    description: 'Entry fee or participation cost for artists'
  },
  {
    value: 'unpaid_exposure',
    label: 'Unpaid / Exposure',
    description: 'Artists participate for visibility and experience'
  },
  {
    value: 'auction_only',
    label: 'Auction proceeds only',
    description: 'Artists earn exclusively from sales of their work'
  },
  {
    value: 'appearance_plus_auction',
    label: 'Appearance fee + Auction',
    description: 'Artists receive a fee and keep auction proceeds'
  },
  {
    value: 'prizes_only',
    label: 'Prizes only',
    description: 'Winners receive prizes or awards'
  },
  {
    value: 'mixed_undecided',
    label: 'Mixed / Undecided',
    description: 'Combination of models or still figuring it out'
  }
]

export function ArtistRelationshipStep() {
  const { intent, setArtistRelationship, goToStep } = useWizardStore()

  const handleSelect = (relationship: ArtistRelationship) => {
    setArtistRelationship(relationship)
  }

  const handleContinue = () => {
    if (intent.artistRelationship) {
      goToStep('summary')
    }
  }

  return (
    <StepContainer
      title="How will artists be compensated?"
      subtitle="This helps us ensure fair practices and appropriate licensing."
      footer={
        <button
          onClick={handleContinue}
          disabled={!intent.artistRelationship}
          className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ab-crimson)] px-8 py-3 font-semibold text-white transition-all duration-200 hover:bg-[var(--ab-crimson-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          See my options
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      }
    >
      <div className="space-y-3">
        {relationshipOptions.map((option) => (
          <SelectionTile
            key={option.value}
            selected={intent.artistRelationship === option.value}
            onClick={() => handleSelect(option.value)}
          >
            <div className="pr-8">
              <h3 className="text-base font-semibold text-white mb-1">
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
