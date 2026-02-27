import { motion } from 'framer-motion'

interface SelectionTileProps {
  selected: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}

export function SelectionTile({
  selected,
  disabled = false,
  onClick,
  children,
  className = ''
}: SelectionTileProps) {
  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`
        relative w-full text-left rounded-xl border-2 p-4 transition-all duration-200
        ${selected
          ? 'border-[var(--ab-crimson)] bg-[var(--ab-crimson)]/10'
          : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10'
        }
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
    >
      {/* Selection indicator */}
      <div className={`
        absolute top-4 right-4 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
        ${selected
          ? 'border-[var(--ab-crimson)] bg-[var(--ab-crimson)]'
          : 'border-white/30'
        }
      `}>
        {selected && (
          <motion.svg
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-3 h-3 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </motion.svg>
        )}
      </div>

      {children}
    </motion.button>
  )
}

interface MultiSelectTileProps {
  selected: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}

export function MultiSelectTile({
  selected,
  disabled = false,
  onClick,
  children,
  className = ''
}: MultiSelectTileProps) {
  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`
        relative w-full text-left rounded-xl border-2 p-4 transition-all duration-200
        ${selected
          ? 'border-[var(--ab-crimson)] bg-[var(--ab-crimson)]/10'
          : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10'
        }
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
    >
      {/* Checkbox indicator */}
      <div className={`
        absolute top-4 right-4 w-5 h-5 rounded border-2 flex items-center justify-center transition-all
        ${selected
          ? 'border-[var(--ab-crimson)] bg-[var(--ab-crimson)]'
          : 'border-white/30'
        }
      `}>
        {selected && (
          <motion.svg
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-3 h-3 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </motion.svg>
        )}
      </div>

      {children}
    </motion.button>
  )
}
