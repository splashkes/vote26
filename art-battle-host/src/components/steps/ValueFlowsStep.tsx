import { useState } from 'react'
import { useWizardStore } from '../../store/wizardStore'
import { MultiSelectTile } from '../SelectionTile'
import { StepContainer } from '../StepContainer'
import type { ValueFlow } from '../../types'

interface FlowOption {
  value: ValueFlow
  label: string
  description: string
  icon: string
}

const flowOptions: FlowOption[] = [
  {
    value: 'fun_congregation',
    label: 'Fun & Congregation',
    description: 'Bringing people together for a great time',
    icon: '🎉'
  },
  {
    value: 'tickets',
    label: 'Tickets',
    description: 'Revenue from admission',
    icon: '🎟️'
  },
  {
    value: 'sponsorship',
    label: 'Sponsorship',
    description: 'Corporate or brand support',
    icon: '🤝'
  },
  {
    value: 'auction',
    label: 'Auction',
    description: 'Live bidding on artwork',
    icon: '🔨'
  },
  {
    value: 'art_sales',
    label: 'Art Sales',
    description: 'Sale of artwork created at the event',
    icon: '🖼️'
  },
  {
    value: 'profit',
    label: 'Making a Profit',
    description: 'Running a profitable event business',
    icon: '💰'
  },
  {
    value: 'donations',
    label: 'Donations',
    description: 'Charitable contributions',
    icon: '💝'
  },
  {
    value: 'grants',
    label: 'Grants',
    description: 'Arts council or foundation funding',
    icon: '📜'
  },
  {
    value: 'merchandise',
    label: 'Merchandise',
    description: 'Sale of branded items',
    icon: '👕'
  },
  {
    value: 'streaming',
    label: 'Streaming',
    description: 'Online broadcast or content',
    icon: '📺'
  },
  {
    value: 'memberships',
    label: 'Memberships',
    description: 'Recurring supporter programs',
    icon: '💳'
  }
]

export function ValueFlowsStep() {
  const { intent, toggleValueFlow, setPrimaryValueFlows, goToStep } = useWizardStore()
  const [showPrimary, setShowPrimary] = useState(false)

  const handleFlowToggle = (flow: ValueFlow) => {
    toggleValueFlow(flow)
  }

  const handlePrimaryToggle = (flow: ValueFlow) => {
    const current = intent.primaryValueFlows
    if (current.includes(flow)) {
      setPrimaryValueFlows(current.filter(f => f !== flow))
    } else if (current.length < 2) {
      setPrimaryValueFlows([...current, flow])
    }
  }

  const handleContinue = () => {
    if (intent.valueFlows.length > 0 && !showPrimary) {
      setShowPrimary(true)
    } else {
      goToStep('summary')
    }
  }

  const canContinue = showPrimary
    ? intent.primaryValueFlows.length > 0
    : intent.valueFlows.length > 0

  return (
    <StepContainer
      title={showPrimary
        ? "Which matter most for success?"
        : "Which of these will be part of your event?"
      }
      subtitle={showPrimary
        ? "Select one or two primary value flows."
        : "Select all revenue or value sources that apply."
      }
      footer={
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-white/40 text-sm">
            {showPrimary
              ? `${intent.primaryValueFlows.length}/2 primary flows selected`
              : `${intent.valueFlows.length} selected`}
          </p>
          <button
            onClick={handleContinue}
            disabled={!canContinue}
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
      {!showPrimary ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {flowOptions.map((option) => (
            <MultiSelectTile
              key={option.value}
              selected={intent.valueFlows.includes(option.value)}
              onClick={() => handleFlowToggle(option.value)}
            >
              <div className="pr-8">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{option.icon}</span>
                  <h3 className="text-base font-semibold text-white">
                    {option.label}
                  </h3>
                </div>
                <p className="text-white/60 text-xs">
                  {option.description}
                </p>
              </div>
            </MultiSelectTile>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-white/60 text-sm">
            From your selected value flows, which are most important?
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {flowOptions
              .filter(o => intent.valueFlows.includes(o.value))
              .map((option) => (
                <MultiSelectTile
                  key={option.value}
                  selected={intent.primaryValueFlows.includes(option.value)}
                  disabled={!intent.primaryValueFlows.includes(option.value) && intent.primaryValueFlows.length >= 2}
                  onClick={() => handlePrimaryToggle(option.value)}
                >
                  <div className="pr-8">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{option.icon}</span>
                      <h3 className="text-base font-semibold text-white">
                        {option.label}
                      </h3>
                    </div>
                    <p className="text-white/60 text-xs">
                      {option.description}
                    </p>
                  </div>
                </MultiSelectTile>
              ))}
          </div>
        </div>
      )}
    </StepContainer>
  )
}
