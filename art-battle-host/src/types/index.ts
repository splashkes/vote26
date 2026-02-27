export type AccessMode = 'public' | 'semi_private' | 'private'

export type FreeMode = 'open_free' | 'free_with_rsvp' | 'included_in_larger_event'

export type PaidTicketBand = '1_15' | '15_35' | '35_75' | '75_plus'

export type AudienceSize = 5 | 25 | 60 | 150 | 400 | 1000 | 5000

export type EventCharacter =
  | 'living_room_battle'
  | 'household_personal'
  | 'competitors_only'
  | 'one_night_showcase'
  | 'ongoing_series'
  | 'seasonal_championship'
  | 'festival_feature'
  | 'brand_activation'
  | 'fundraiser'
  | 'educational_program'
  | 'institutional_program'
  | 'experimental_format'

export type ValueFlow =
  | 'tickets'
  | 'sponsorship'
  | 'auction'
  | 'donations'
  | 'grants'
  | 'merchandise'
  | 'streaming'
  | 'memberships'
  | 'fun_congregation'
  | 'profit'
  | 'art_sales'

export type ArtistRelationship =
  | 'pay_to_participate'
  | 'unpaid_exposure'
  | 'auction_only'
  | 'appearance_plus_auction'
  | 'prizes_only'
  | 'mixed_undecided'

export type PackageType = 'simple' | 'consultation'

export interface EventIntent {
  accessMode: AccessMode | null
  attendanceType: 'free' | 'paid' | null
  freeMode: FreeMode | null
  paidTicketBand: PaidTicketBand | null
  audienceMax: AudienceSize
  eventCharacterTags: EventCharacter[]
  valueFlows: ValueFlow[]
  primaryValueFlows: ValueFlow[]
  artistRelationship: ArtistRelationship | null
}

export interface ContactInfo {
  name: string
  email: string
  phone: string
  organization: string
  city: string
  country: string
  notes: string
}

export interface ClassificationResult {
  packageType: PackageType
  reasons: string[]
  riskFactors: string[]
}

export type WizardStep =
  | 'landing'
  | 'access'
  | 'attendance'
  | 'audience'
  | 'character'
  | 'value_flows'
  | 'artist_relationship'
  | 'summary'
  | 'contact'
  | 'checkout'
  | 'confirmation'
