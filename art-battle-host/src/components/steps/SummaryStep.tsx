import { motion } from 'framer-motion'
import { useWizardStore } from '../../store/wizardStore'
import { StepContainer } from '../StepContainer'
import type { AccessMode, FreeMode, PaidTicketBand, EventCharacter, ValueFlow } from '../../types'

// Label mappings
const accessLabels: Record<AccessMode, string> = {
  public: 'Public Event',
  semi_private: 'Semi-Private Event',
  private: 'Private Event'
}

const freeModeLabels: Record<FreeMode, string> = {
  open_free: 'Open & Free',
  free_with_rsvp: 'Free with RSVP',
  included_in_larger_event: 'Part of Larger Event'
}

const ticketBandLabels: Record<PaidTicketBand, string> = {
  '1_15': '$1-$15 tickets',
  '15_35': '$15-$35 tickets',
  '35_75': '$35-$75 tickets',
  '75_plus': '$75+ tickets'
}

const characterLabels: Record<EventCharacter, string> = {
  living_room_battle: 'Living Room Battle',
  household_personal: 'Personal Celebration',
  competitors_only: 'Competitors Only',
  one_night_showcase: 'One-Night Showcase',
  ongoing_series: 'Ongoing Series',
  seasonal_championship: 'Championship Arc',
  festival_feature: 'Festival Feature',
  brand_activation: 'Brand Activation',
  fundraiser: 'Fundraiser',
  educational_program: 'Educational Program',
  institutional_program: 'Institutional Program',
  experimental_format: 'Experimental Format'
}

const flowLabels: Record<ValueFlow, string> = {
  fun_congregation: 'Fun & Congregation',
  tickets: 'Tickets',
  sponsorship: 'Sponsorship',
  auction: 'Auction',
  art_sales: 'Art Sales',
  profit: 'Making a Profit',
  donations: 'Donations',
  grants: 'Grants',
  merchandise: 'Merchandise',
  streaming: 'Streaming',
  memberships: 'Memberships'
}

export function SummaryStep() {
  const { intent, getClassification, goToStep } = useWizardStore()
  const classification = getClassification()
  const isSimple = classification.packageType === 'simple'

  return (
    <StepContainer
      title="Your Event Snapshot"
      subtitle="Here's what we understand about your Art Battle event."
      footer={
        <div className="flex flex-col md:flex-row gap-4">
          {isSimple ? (
            <button
              onClick={() => goToStep('checkout')}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ab-crimson)] px-8 py-4 font-semibold text-white transition-all duration-200 hover:bg-[var(--ab-crimson-dark)]"
            >
              Get started now
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => goToStep('contact')}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ab-crimson)] px-8 py-4 font-semibold text-white transition-all duration-200 hover:bg-[var(--ab-crimson-dark)]"
            >
              Talk to the Art Battle team
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Classification badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${
            isSimple
              ? 'bg-green-500/20 text-green-300 border border-green-500/30'
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
          }`}
        >
          {isSimple ? (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">Self-Serve Package Available</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="font-medium">Consultation Recommended</span>
            </>
          )}
        </motion.div>

        {/* Summary cards */}
        <div className="grid gap-4">
          {/* Access & Attendance */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-3">Access & Attendance</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-white font-medium">{intent.accessMode && accessLabels[intent.accessMode]}</span>
              </div>
              <div className="text-white/70">
                {intent.attendanceType === 'free' && intent.freeMode && freeModeLabels[intent.freeMode]}
                {intent.attendanceType === 'paid' && intent.paidTicketBand && ticketBandLabels[intent.paidTicketBand]}
              </div>
            </div>
          </div>

          {/* Scale */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-3">Expected Attendance</h3>
            <div className="text-2xl font-bold text-white">
              Up to {intent.audienceMax.toLocaleString()} guests
            </div>
          </div>

          {/* Event Character */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-3">Event Type</h3>
            <div className="flex flex-wrap gap-2">
              {intent.eventCharacterTags.map(tag => (
                <span key={tag} className="px-3 py-1 bg-white/10 rounded-full text-sm text-white">
                  {characterLabels[tag]}
                </span>
              ))}
            </div>
          </div>

          {/* Value Flows */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-3">Revenue & Value</h3>
            <div className="flex flex-wrap gap-2">
              {intent.valueFlows.map(flow => (
                <span
                  key={flow}
                  className={`px-3 py-1 rounded-full text-sm ${
                    intent.primaryValueFlows.includes(flow)
                      ? 'bg-[var(--ab-crimson)]/20 text-[var(--ab-crimson-light)] border border-[var(--ab-crimson)]/30'
                      : 'bg-white/10 text-white'
                  }`}
                >
                  {flowLabels[flow]}
                  {intent.primaryValueFlows.includes(flow) && ' (Primary)'}
                </span>
              ))}
            </div>
          </div>

        </div>

        {/* Risk factors if any */}
        {classification.riskFactors.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <h3 className="text-sm font-medium text-amber-300 uppercase tracking-wide mb-2">Things to Consider</h3>
            <ul className="space-y-1">
              {classification.riskFactors.map((factor, i) => (
                <li key={i} className="text-amber-200/80 text-sm flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                  {factor}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Next step explanation */}
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-2">Next Steps</h3>
          {isSimple ? (
            <p className="text-white/70 text-sm">
              Your event qualifies for our self-serve package. You can complete your registration
              and get started right away with instant access to host tools.
            </p>
          ) : (
            <p className="text-white/70 text-sm">
              Based on your event's scale and complexity, we recommend a brief consultation
              with our team. We'll help ensure everything is set up for success and discuss
              the best licensing arrangement for your situation.
            </p>
          )}
        </div>
      </div>
    </StepContainer>
  )
}
