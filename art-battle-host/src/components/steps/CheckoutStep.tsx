import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { motion } from 'framer-motion'
import { useWizardStore } from '../../store/wizardStore'
import { StepContainer } from '../StepContainer'
import type { ContactInfo } from '../../types'

// Simple package options for self-serve
const packages = [
  {
    id: 'starter',
    name: 'Starter',
    price: 199,
    description: 'Perfect for first-time hosts',
    features: [
      'Single event license',
      'Official Art Battle branding',
      'Digital host toolkit',
      'Email support'
    ]
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 399,
    description: 'Our most popular package',
    features: [
      'Single event license',
      'Official Art Battle branding',
      'Digital host toolkit',
      'Timer & voting app access',
      'Priority email support',
      'Host training session'
    ],
    popular: true
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 699,
    description: 'For serious hosts',
    features: [
      'Single event license',
      'Official Art Battle branding',
      'Digital host toolkit',
      'Timer & voting app access',
      'Priority support',
      'Host training session',
      'Marketing materials',
      'Post-event analytics'
    ]
  }
]

export function CheckoutStep() {
  const { contactInfo, setContactInfo, goToStep, intent } = useWizardStore()
  const [selectedPackage, setSelectedPackage] = useState('standard')
  const [isProcessing, setIsProcessing] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isValid }
  } = useForm<ContactInfo>({
    defaultValues: contactInfo,
    mode: 'onChange'
  })

  const onSubmit = async (data: ContactInfo) => {
    setContactInfo(data)
    setIsProcessing(true)

    // Prepare the payload
    const payload = {
      contact: data,
      intent,
      package: selectedPackage,
      submittedAt: new Date().toISOString()
    }

    // In production, this would redirect to Stripe Checkout
    console.log('Processing checkout:', payload)

    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 1500))

    setIsProcessing(false)
    goToStep('confirmation')
  }

  const selectedPkg = packages.find(p => p.id === selectedPackage)!

  return (
    <StepContainer
      title="Almost there"
      subtitle="Choose your package and complete your registration."
    >
      <div className="space-y-8">
        {/* Package selection */}
        <div>
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-4">
            Select Your Package
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {packages.map((pkg) => (
              <motion.button
                key={pkg.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedPackage(pkg.id)}
                className={`relative text-left rounded-xl border-2 p-4 transition-all ${
                  selectedPackage === pkg.id
                    ? 'border-[var(--ab-crimson)] bg-[var(--ab-crimson)]/10'
                    : 'border-white/10 bg-white/5 hover:border-white/30'
                }`}
              >
                {pkg.popular && (
                  <div className="absolute -top-3 left-4 px-3 py-1 bg-[var(--ab-crimson)] rounded-full text-xs font-medium text-white">
                    Most Popular
                  </div>
                )}

                <div className="mb-3">
                  <h4 className="text-lg font-semibold text-white">{pkg.name}</h4>
                  <p className="text-white/60 text-sm">{pkg.description}</p>
                </div>

                <div className="mb-4">
                  <span className="text-3xl font-bold text-white">${pkg.price}</span>
                  <span className="text-white/40 text-sm"> USD</span>
                </div>

                <ul className="space-y-2">
                  {pkg.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                      <svg className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Selection indicator */}
                <div className={`absolute top-4 right-4 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  selectedPackage === pkg.id
                    ? 'border-[var(--ab-crimson)] bg-[var(--ab-crimson)]'
                    : 'border-white/30'
                }`}>
                  {selectedPackage === pkg.id && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Contact form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide">
            Your Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">
                Name <span className="text-[var(--ab-crimson)]">*</span>
              </label>
              <input
                {...register('name', { required: 'Name is required' })}
                type="text"
                placeholder="Your name"
                className={`w-full rounded-lg border bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none transition-all duration-200 focus:bg-white/10 ${
                  errors.name ? 'border-red-500' : 'border-white/20 focus:border-[var(--ab-crimson)]'
                }`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">
                Email <span className="text-[var(--ab-crimson)]">*</span>
              </label>
              <input
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email'
                  }
                })}
                type="email"
                placeholder="you@example.com"
                className={`w-full rounded-lg border bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none transition-all duration-200 focus:bg-white/10 ${
                  errors.email ? 'border-red-500' : 'border-white/20 focus:border-[var(--ab-crimson)]'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">
                City <span className="text-[var(--ab-crimson)]">*</span>
              </label>
              <input
                {...register('city', { required: 'City is required' })}
                type="text"
                placeholder="Your city"
                className={`w-full rounded-lg border bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none transition-all duration-200 focus:bg-white/10 ${
                  errors.city ? 'border-red-500' : 'border-white/20 focus:border-[var(--ab-crimson)]'
                }`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">
                Country <span className="text-[var(--ab-crimson)]">*</span>
              </label>
              <input
                {...register('country', { required: 'Country is required' })}
                type="text"
                placeholder="Your country"
                className={`w-full rounded-lg border bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none transition-all duration-200 focus:bg-white/10 ${
                  errors.country ? 'border-red-500' : 'border-white/20 focus:border-[var(--ab-crimson)]'
                }`}
              />
            </div>
          </div>

          {/* Order summary */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-white font-medium">{selectedPkg.name} Package</h4>
                <p className="text-white/60 text-sm">{selectedPkg.description}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-white">${selectedPkg.price}</div>
                <div className="text-white/40 text-sm">USD</div>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!isValid || isProcessing}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ab-crimson)] px-8 py-4 font-semibold text-white transition-all duration-200 hover:bg-[var(--ab-crimson-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </>
            ) : (
              <>
                Continue to Payment
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>

          <p className="text-center text-white/40 text-sm">
            You'll be redirected to our secure payment processor
          </p>
        </form>
      </div>
    </StepContainer>
  )
}
