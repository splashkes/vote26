import { motion } from 'framer-motion'
import { useWizardStore } from '../../store/wizardStore'

export function ConfirmationStep() {
  const { getClassification, contactInfo, reset } = useWizardStore()
  const classification = getClassification()
  const isSimple = classification.packageType === 'simple'

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg text-center"
      >
        {/* Success icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center"
        >
          <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-3xl md:text-4xl font-bold text-white mb-4"
        >
          {isSimple ? "You're all set!" : "Thank you!"}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-white/70 text-lg mb-8"
        >
          {isSimple ? (
            <>
              We've received your registration. Check your email at{' '}
              <span className="text-white font-medium">{contactInfo.email}</span>
              {' '}for confirmation and next steps.
            </>
          ) : (
            <>
              We've received your event snapshot. Someone from the Art Battle team
              will be in touch with you at{' '}
              <span className="text-white font-medium">{contactInfo.email}</span>
              {' '}within 1-2 business days.
            </>
          )}
        </motion.p>

        {/* What happens next */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white/5 rounded-xl p-6 border border-white/10 text-left mb-8"
        >
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-4">
            What happens next
          </h3>
          <ul className="space-y-3">
            {isSimple ? (
              <>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[var(--ab-crimson)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[var(--ab-crimson)] text-sm font-medium">1</span>
                  </div>
                  <span className="text-white/70">Check your email for confirmation and login credentials</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[var(--ab-crimson)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[var(--ab-crimson)] text-sm font-medium">2</span>
                  </div>
                  <span className="text-white/70">Access the host dashboard to set up your event</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[var(--ab-crimson)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[var(--ab-crimson)] text-sm font-medium">3</span>
                  </div>
                  <span className="text-white/70">Follow the preparation checklist to get ready</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[var(--ab-crimson)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[var(--ab-crimson)] text-sm font-medium">4</span>
                  </div>
                  <span className="text-white/70">Host your official Art Battle event!</span>
                </li>
              </>
            ) : (
              <>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[var(--ab-crimson)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[var(--ab-crimson)] text-sm font-medium">1</span>
                  </div>
                  <span className="text-white/70">Our team reviews your event details</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[var(--ab-crimson)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[var(--ab-crimson)] text-sm font-medium">2</span>
                  </div>
                  <span className="text-white/70">We'll reach out to discuss your specific needs</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[var(--ab-crimson)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[var(--ab-crimson)] text-sm font-medium">3</span>
                  </div>
                  <span className="text-white/70">Together we'll create the perfect package for your event</span>
                </li>
              </>
            )}
          </ul>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <a
            href="https://artbattle.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-white/20 bg-white/5 px-6 py-3 font-semibold text-white transition-all duration-200 hover:border-white/40 hover:bg-white/10"
          >
            Visit Art Battle
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ab-crimson)] px-6 py-3 font-semibold text-white transition-all duration-200 hover:bg-[var(--ab-crimson-dark)]"
          >
            Plan Another Event
          </button>
        </motion.div>
      </motion.div>
    </div>
  )
}
