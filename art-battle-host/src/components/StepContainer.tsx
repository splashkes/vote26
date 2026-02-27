interface StepContainerProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
}

export function StepContainer({ title, subtitle, children, footer }: StepContainerProps) {
  return (
    <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
          {title}
        </h1>
        {subtitle && (
          <p className="text-white/60 text-lg">
            {subtitle}
          </p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1">
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div className="mt-8 pt-6 border-t border-white/10">
          {footer}
        </div>
      )}
    </div>
  )
}
