import { useWizardStore } from './store/wizardStore'
import { WizardLayout } from './components/WizardLayout'
import { LandingStep } from './components/steps/LandingStep'
import { AccessStep } from './components/steps/AccessStep'
import { AttendanceStep } from './components/steps/AttendanceStep'
import { AudienceStep } from './components/steps/AudienceStep'
import { CharacterStep } from './components/steps/CharacterStep'
import { ValueFlowsStep } from './components/steps/ValueFlowsStep'
import { ArtistRelationshipStep } from './components/steps/ArtistRelationshipStep'
import { SummaryStep } from './components/steps/SummaryStep'
import { ContactStep } from './components/steps/ContactStep'
import { CheckoutStep } from './components/steps/CheckoutStep'
import { ConfirmationStep } from './components/steps/ConfirmationStep'

function App() {
  const { currentStep } = useWizardStore()

  const renderStep = () => {
    switch (currentStep) {
      case 'landing':
        return <LandingStep />
      case 'access':
        return <AccessStep />
      case 'attendance':
        return <AttendanceStep />
      case 'audience':
        return <AudienceStep />
      case 'character':
        return <CharacterStep />
      case 'value_flows':
        return <ValueFlowsStep />
      case 'artist_relationship':
        return <ArtistRelationshipStep />
      case 'summary':
        return <SummaryStep />
      case 'contact':
        return <ContactStep />
      case 'checkout':
        return <CheckoutStep />
      case 'confirmation':
        return <ConfirmationStep />
      default:
        return <LandingStep />
    }
  }

  return (
    <WizardLayout>
      {renderStep()}
    </WizardLayout>
  )
}

export default App
