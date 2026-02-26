import { type InputHTMLAttributes, forwardRef } from 'react'
import { clsx } from 'clsx'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  leftSlot?: React.ReactNode
  rightSlot?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftSlot, rightSlot, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-sm font-medium text-gray-700">{label}</label>
        )}
        <div className="relative flex items-center">
          {leftSlot && (
            <span className="absolute left-3 text-gray-400 pointer-events-none">
              {leftSlot}
            </span>
          )}
          <input
            ref={ref}
            className={clsx(
              'w-full h-11 rounded-xl border bg-white text-gray-900 placeholder:text-gray-400',
              'text-sm px-3 transition-colors duration-150',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
              error
                ? 'border-red-400 bg-red-50'
                : 'border-gray-200 hover:border-gray-300',
              leftSlot && 'pl-9',
              rightSlot && 'pr-9',
              className
            )}
            {...props}
          />
          {rightSlot && (
            <span className="absolute right-3 text-gray-400 pointer-events-none">
              {rightSlot}
            </span>
          )}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
