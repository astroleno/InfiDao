interface TypingIndicatorProps {
  isActive: boolean;
  color?: 'primary' | 'amber' | 'gray';
  size?: 'sm' | 'md' | 'lg';
}

export function TypingIndicator({ isActive, color = 'primary', size = 'md' }: TypingIndicatorProps) {
  if (!isActive) return null;

  const sizeClasses = {
    sm: 'w-1 h-4',
    md: 'w-1 h-5',
    lg: 'w-1.5 h-6'
  };

  const colorClasses = {
    primary: 'bg-zen',
    amber: 'bg-seal',
    gray: 'bg-stone-500'
  };

  return (
    <span className={`inline-block ${sizeClasses[size]} ${colorClasses[color]} ml-1 motion-safe:animate-pulse`}></span>
  );
}
