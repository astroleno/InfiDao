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
    primary: 'bg-primary-600',
    amber: 'bg-amber-600',
    gray: 'bg-gray-600'
  };

  return (
    <span className={`inline-block ${sizeClasses[size]} ${colorClasses[color]} ml-1 animate-pulse`}></span>
  );
}