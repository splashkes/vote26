import { useForm } from 'react-hook-form'
import { useWizardStore } from '../../store/wizardStore'
import { StepContainer } from '../StepContainer'
import type { ContactInfo } from '../../types'

export function ContactStep() {
  const { contactInfo, setContactInfo, goToStep, intent } = useWizardStore()

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

    // Prepare the payload
    const payload = {
      contact: data,
      intent,
      submittedAt: new Date().toISOString()
    }

    // Submit to API (would be a real endpoint in production)
    console.log('Submitting lead:', payload)

    // For now, just go to confirmation
    goToStep('confirmation')
  }

  return (
    <StepContainer
      title="Let's get in touch"
      subtitle="We'll reach out within 1-2 business days to discuss your event."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Name & Email */}
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
            {errors.name && (
              <p className="mt-1 text-sm text-red-400">{errors.name.message}</p>
            )}
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
                  message: 'Invalid email address'
                }
              })}
              type="email"
              placeholder="you@example.com"
              className={`w-full rounded-lg border bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none transition-all duration-200 focus:bg-white/10 ${
                errors.email ? 'border-red-500' : 'border-white/20 focus:border-[var(--ab-crimson)]'
              }`}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-400">{errors.email.message}</p>
            )}
          </div>
        </div>

        {/* Phone & Organization */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-white/60 mb-2">
              Phone <span className="text-white/40">(optional)</span>
            </label>
            <input
              {...register('phone')}
              type="tel"
              placeholder="+1 (555) 000-0000"
              className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none transition-all duration-200 focus:border-[var(--ab-crimson)] focus:bg-white/10"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/60 mb-2">
              Organization <span className="text-white/40">(optional)</span>
            </label>
            <input
              {...register('organization')}
              type="text"
              placeholder="Company or organization"
              className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none transition-all duration-200 focus:border-[var(--ab-crimson)] focus:bg-white/10"
            />
          </div>
        </div>

        {/* City & Country */}
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
            {errors.city && (
              <p className="mt-1 text-sm text-red-400">{errors.city.message}</p>
            )}
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
            {errors.country && (
              <p className="mt-1 text-sm text-red-400">{errors.country.message}</p>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-white/60 mb-2">
            Anything else we should know? <span className="text-white/40">(optional)</span>
          </label>
          <textarea
            {...register('notes')}
            rows={4}
            placeholder="Tell us more about your event, venue, or any specific questions..."
            className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none transition-all duration-200 focus:border-[var(--ab-crimson)] focus:bg-white/10 resize-none"
          />
        </div>

        {/* Submit */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={!isValid}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ab-crimson)] px-8 py-4 font-semibold text-white transition-all duration-200 hover:bg-[var(--ab-crimson-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit & Get in Touch
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </form>
    </StepContainer>
  )
}
