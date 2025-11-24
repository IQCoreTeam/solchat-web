'use client';

interface NotificationToggleProps {
  enabled: boolean;
  onToggle: () => void;
  label?: string;
  size?: 'sm' | 'md';
}

export function NotificationToggle({
  enabled,
  onToggle,
  label = 'Alerts',
  size = 'md',
}: NotificationToggleProps) {
  const baseClasses =
    'inline-flex items-center gap-2 rounded-full border px-3 py-1 transition text-xs uppercase tracking-wide';

  const sizeStyles =
    size === 'sm'
      ? 'text-[10px] px-2 py-0.5'
      : '';

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${baseClasses} ${sizeStyles}`}
      style={{
        borderColor: enabled ? 'rgba(65, 255, 0, 0.6)' : 'rgba(255, 255, 255, 0.2)',
        color: enabled ? 'rgb(65, 255, 0)' : 'rgba(255, 255, 255, 0.65)',
        backgroundColor: enabled ? 'rgba(65, 255, 0, 0.1)' : 'transparent',
      }}
      aria-pressed={enabled}
    >
      <span>{label}</span>
      <span>{enabled ? 'ON' : 'OFF'}</span>
    </button>
  );
}
