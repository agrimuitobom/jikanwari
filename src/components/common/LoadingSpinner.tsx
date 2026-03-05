interface LoadingSpinnerProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
}

export function LoadingSpinner({ message, size = 'md' }: LoadingSpinnerProps) {
  const sizeClass = { sm: 'h-5 w-5 border-2', md: 'h-8 w-8 border-4', lg: 'h-12 w-12 border-4' }[size]

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <div
        className={`${sizeClass} animate-spin rounded-full border-gray-200 border-t-primary-600`}
        role="status"
        aria-label="読み込み中"
      />
      {message && <p className="text-sm text-gray-500">{message}</p>}
    </div>
  )
}
