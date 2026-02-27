import { useWizardStore } from '../../store/wizardStore'
import { SelectionTile } from '../SelectionTile'
import { StepContainer } from '../StepContainer'
import type { FreeMode, PaidTicketBand } from '../../types'

const freeModeOptions: { value: FreeMode; label: string; description: string }[] = [
  {
    value: 'open_free',
    label: 'Open & Free',
    description: 'No tickets required - guests simply show up.'
  },
  {
    value: 'free_with_rsvp',
    label: 'Free with RSVP',
    description: 'Free admission but guests need to register or claim a ticket.'
  },
  {
    value: 'included_in_larger_event',
    label: 'Part of a larger event',
    description: 'Included in a conference, festival, corporate function, or similar paid experience.'
  }
]

const ticketBandOptions: { value: PaidTicketBand; label: string; description: string }[] = [
  {
    value: '1_15',
    label: '$1 - $15',
    description: 'Low-cost community accessibility'
  },
  {
    value: '15_35',
    label: '$15 - $35',
    description: 'Standard event pricing'
  },
  {
    value: '35_75',
    label: '$35 - $75',
    description: 'Premium experience'
  },
  {
    value: '75_plus',
    label: '$75+',
    description: 'VIP or exclusive event'
  }
]

export function AttendanceStep() {
  const { intent, setAttendanceType, setFreeMode, setPaidTicketBand, goToStep } = useWizardStore()

  const handleContinue = () => {
    if (intent.attendanceType === 'free' && intent.freeMode) {
      goToStep('audience')
    } else if (intent.attendanceType === 'paid' && intent.paidTicketBand) {
      goToStep('audience')
    }
  }

  const canContinue = intent.attendanceType === 'free'
    ? !!intent.freeMode
    : intent.attendanceType === 'paid'
      ? !!intent.paidTicketBand
      : false

  return (
    <StepContainer
      title="How does attendance work for your guests?"
      subtitle="Understanding your ticketing helps us match you with the right package."
      footer={
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
      }
    >
      <div className="space-y-8">
        {/* Free vs Paid toggle */}
        <div className="grid grid-cols-2 gap-4">
          <SelectionTile
            selected={intent.attendanceType === 'free'}
            onClick={() => setAttendanceType('free')}
          >
            <div className="pr-8">
              <h3 className="text-lg font-semibold text-white">Free Entry</h3>
            </div>
          </SelectionTile>
          <SelectionTile
            selected={intent.attendanceType === 'paid'}
            onClick={() => setAttendanceType('paid')}
          >
            <div className="pr-8">
              <h3 className="text-lg font-semibold text-white">Paid Tickets</h3>
            </div>
          </SelectionTile>
        </div>

        {/* Conditional sub-options */}
        {intent.attendanceType === 'free' && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-white/60 uppercase tracking-wide">
              What kind of free entry?
            </h4>
            <div className="space-y-3">
              {freeModeOptions.map((option) => (
                <SelectionTile
                  key={option.value}
                  selected={intent.freeMode === option.value}
                  onClick={() => setFreeMode(option.value)}
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
          </div>
        )}

        {intent.attendanceType === 'paid' && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-white/60 uppercase tracking-wide">
              Expected ticket price range
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {ticketBandOptions.map((option) => (
                <SelectionTile
                  key={option.value}
                  selected={intent.paidTicketBand === option.value}
                  onClick={() => setPaidTicketBand(option.value)}
                >
                  <div className="pr-8">
                    <h3 className="text-base font-semibold text-white mb-1">
                      {option.label}
                    </h3>
                    <p className="text-white/50 text-xs">
                      {option.description}
                    </p>
                  </div>
                </SelectionTile>
              ))}
            </div>
          </div>
        )}
      </div>
    </StepContainer>
  )
}
