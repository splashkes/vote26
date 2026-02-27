import { create } from 'zustand'
import type {
  EventIntent,
  ContactInfo,
  WizardStep,
  AccessMode,
  FreeMode,
  PaidTicketBand,
  AudienceSize,
  EventCharacter,
  ValueFlow,
  ArtistRelationship,
  ClassificationResult,
  PackageType
} from '../types'

interface WizardState {
  // Current step
  currentStep: WizardStep
  stepHistory: WizardStep[]

  // Event intent data
  intent: EventIntent

  // Contact info
  contactInfo: ContactInfo

  // Navigation
  goToStep: (step: WizardStep) => void
  goBack: () => void
  canGoBack: () => boolean

  // Intent setters
  setAccessMode: (mode: AccessMode) => void
  setAttendanceType: (type: 'free' | 'paid') => void
  setFreeMode: (mode: FreeMode) => void
  setPaidTicketBand: (band: PaidTicketBand) => void
  setAudienceMax: (size: AudienceSize) => void
  toggleEventCharacter: (character: EventCharacter) => void
  toggleValueFlow: (flow: ValueFlow) => void
  setPrimaryValueFlows: (flows: ValueFlow[]) => void
  setArtistRelationship: (relationship: ArtistRelationship) => void

  // Contact setters
  setContactInfo: (info: Partial<ContactInfo>) => void

  // Classification
  getClassification: () => ClassificationResult

  // Reset
  reset: () => void
}

const initialIntent: EventIntent = {
  accessMode: null,
  attendanceType: null,
  freeMode: null,
  paidTicketBand: null,
  audienceMax: 60,
  eventCharacterTags: [],
  valueFlows: [],
  primaryValueFlows: [],
  artistRelationship: null
}

const initialContactInfo: ContactInfo = {
  name: '',
  email: '',
  phone: '',
  organization: '',
  city: '',
  country: '',
  notes: ''
}

// Classification logic
function classifyEvent(intent: EventIntent): ClassificationResult {
  const reasons: string[] = []
  const riskFactors: string[] = []
  let packageType: PackageType = 'simple'

  // Check audience size
  if (intent.audienceMax > 150) {
    packageType = 'consultation'
    reasons.push('Large audience size requires production support')
  }

  // Check event character complexity
  const complexCharacters: EventCharacter[] = [
    'seasonal_championship',
    'festival_feature',
    'brand_activation',
    'institutional_program'
  ]
  const hasComplexCharacter = intent.eventCharacterTags.some(c => complexCharacters.includes(c))
  if (hasComplexCharacter) {
    packageType = 'consultation'
    reasons.push('Event type requires custom licensing and support')
  }

  // Check value flows complexity
  const complexFlows: ValueFlow[] = ['sponsorship', 'grants', 'streaming', 'memberships']
  const hasComplexFlows = intent.valueFlows.some(f => complexFlows.includes(f))
  if (hasComplexFlows && intent.valueFlows.length > 2) {
    packageType = 'consultation'
    reasons.push('Multiple revenue streams require custom arrangement')
  }

  // Check for corporate embedding
  if (intent.freeMode === 'included_in_larger_event' && intent.audienceMax > 100) {
    packageType = 'consultation'
    reasons.push('Embedded event requires partnership agreement')
  }

  // Default simple reasons
  if (packageType === 'simple') {
    reasons.push('Standard event format')
    reasons.push('Self-serve package available')
  }

  // Add risk factors
  if (intent.audienceMax >= 400) {
    riskFactors.push('Insurance requirements for large gatherings')
  }
  if (intent.eventCharacterTags.includes('brand_activation')) {
    riskFactors.push('Brand usage licensing required')
  }
  if (intent.valueFlows.includes('streaming')) {
    riskFactors.push('Broadcast rights negotiation needed')
  }

  return { packageType, reasons, riskFactors }
}

export const useWizardStore = create<WizardState>((set, get) => ({
  currentStep: 'landing',
  stepHistory: [],
  intent: initialIntent,
  contactInfo: initialContactInfo,

  goToStep: (step) => set((state) => ({
    currentStep: step,
    stepHistory: [...state.stepHistory, state.currentStep]
  })),

  goBack: () => set((state) => {
    const newHistory = [...state.stepHistory]
    const previousStep = newHistory.pop() || 'landing'
    return {
      currentStep: previousStep,
      stepHistory: newHistory
    }
  }),

  canGoBack: () => get().stepHistory.length > 0,

  setAccessMode: (mode) => set((state) => ({
    intent: { ...state.intent, accessMode: mode }
  })),

  setAttendanceType: (type) => set((state) => ({
    intent: {
      ...state.intent,
      attendanceType: type,
      freeMode: type === 'paid' ? null : state.intent.freeMode,
      paidTicketBand: type === 'free' ? null : state.intent.paidTicketBand
    }
  })),

  setFreeMode: (mode) => set((state) => ({
    intent: { ...state.intent, freeMode: mode }
  })),

  setPaidTicketBand: (band) => set((state) => ({
    intent: { ...state.intent, paidTicketBand: band }
  })),

  setAudienceMax: (size) => set((state) => ({
    intent: { ...state.intent, audienceMax: size }
  })),

  toggleEventCharacter: (character) => set((state) => {
    const current = state.intent.eventCharacterTags
    const exists = current.includes(character)
    return {
      intent: {
        ...state.intent,
        eventCharacterTags: exists
          ? current.filter(c => c !== character)
          : [...current, character]
      }
    }
  }),

  toggleValueFlow: (flow) => set((state) => {
    const current = state.intent.valueFlows
    const exists = current.includes(flow)
    const newFlows = exists
      ? current.filter(f => f !== flow)
      : [...current, flow]
    // Also remove from primary if removing
    const newPrimary = exists
      ? state.intent.primaryValueFlows.filter(f => f !== flow)
      : state.intent.primaryValueFlows
    return {
      intent: {
        ...state.intent,
        valueFlows: newFlows,
        primaryValueFlows: newPrimary
      }
    }
  }),

  setPrimaryValueFlows: (flows) => set((state) => ({
    intent: { ...state.intent, primaryValueFlows: flows }
  })),

  setArtistRelationship: (relationship) => set((state) => ({
    intent: { ...state.intent, artistRelationship: relationship }
  })),

  setContactInfo: (info) => set((state) => ({
    contactInfo: { ...state.contactInfo, ...info }
  })),

  getClassification: () => classifyEvent(get().intent),

  reset: () => set({
    currentStep: 'landing',
    stepHistory: [],
    intent: initialIntent,
    contactInfo: initialContactInfo
  })
}))
