import { motion } from 'framer-motion'
import { useWizardStore } from '../../store/wizardStore'

export function LandingStep() {
  const { goToStep } = useWizardStore()

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-2xl text-center">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <img
            src="https://artb.tor1.cdn.digitaloceanspaces.com/img/ab-logo-white.png"
            alt="Art Battle"
            className="h-12 md:h-16 mx-auto mb-8"
          />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-3xl md:text-5xl font-bold text-white mb-4"
        >
          Host an Official Art Battle Event
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-xl md:text-2xl text-white/70 mb-8"
        >
          Bring the world's most exciting live painting competition to your community, campus, venue, or event.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-white/60 mb-10 max-w-xl mx-auto"
        >
          <p className="mb-4">
            In a few quick steps, we'll learn what you're planning and show you the best way to make it official.
          </p>
          <p>
            Smaller, simpler events can often get started instantly with a self-serve package.
            Bigger, sponsored, or more complex events usually begin with a short consultation so we can support you properly.
          </p>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <button
            onClick={() => goToStep('access')}
            className="inline-flex items-center justify-center gap-3 rounded-xl bg-[var(--ab-crimson)] px-8 py-4 text-lg font-semibold text-white transition-all duration-200 hover:bg-[var(--ab-crimson-dark)] hover:scale-[1.02]"
          >
            Start hosting
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-white/40 text-sm mt-6"
        >
          This takes about 3-5 minutes and doesn't lock you into anything.
        </motion.p>
      </div>
    </div>
  )
}
