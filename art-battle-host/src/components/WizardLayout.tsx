import { motion, AnimatePresence } from 'framer-motion'
import { useWizardStore } from '../store/wizardStore'
import type { WizardStep } from '../types'

interface WizardLayoutProps {
  children: React.ReactNode
}

const stepOrder: WizardStep[] = [
  'landing',
  'access',
  'attendance',
  'audience',
  'character',
  'value_flows',
  'artist_relationship',
  'summary',
  'contact',
  'checkout',
  'confirmation'
]

export function WizardLayout({ children }: WizardLayoutProps) {
  const { currentStep, goBack, canGoBack } = useWizardStore()
  const stepIndex = stepOrder.indexOf(currentStep)
  const totalSteps = 7 // Main wizard steps before summary
  const progress = stepIndex > 0 && stepIndex <= totalSteps
    ? ((stepIndex) / totalSteps) * 100
    : 0

  const showProgress = stepIndex > 0 && stepIndex <= totalSteps

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/30 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {canGoBack() && currentStep !== 'confirmation' && (
              <button
                onClick={goBack}
                className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-sm">Back</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <img
              src="https://artb.tor1.cdn.digitaloceanspaces.com/img/ab-logo-white.png"
              alt="Art Battle"
              className="h-6"
            />
          </div>
        </div>

        {/* Progress bar */}
        {showProgress && (
          <div className="h-1 bg-white/10">
            <motion.div
              className="h-full bg-[var(--ab-crimson)]"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="flex-1 flex flex-col"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
