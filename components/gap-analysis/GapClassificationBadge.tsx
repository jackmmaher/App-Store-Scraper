'use client';

interface Props {
  classification: 'global_leader' | 'brand' | 'local_champion' | null;
  reason?: string | null;
  size?: 'sm' | 'md';
}

export default function GapClassificationBadge({ classification, reason, size = 'md' }: Props) {
  if (!classification) {
    return null;
  }

  const config = {
    global_leader: {
      label: 'Global Leader',
      icon: '\u{1F30D}',
      bg: 'bg-purple-100 dark:bg-purple-900',
      text: 'text-purple-800 dark:text-purple-200',
      border: 'border-purple-300 dark:border-purple-700',
    },
    brand: {
      label: 'Brand',
      icon: '\u{1F3F7}\u{FE0F}',
      bg: 'bg-orange-100 dark:bg-orange-900',
      text: 'text-orange-800 dark:text-orange-200',
      border: 'border-orange-300 dark:border-orange-700',
    },
    local_champion: {
      label: 'Local Champion',
      icon: '\u{1F3C6}',
      bg: 'bg-green-100 dark:bg-green-900',
      text: 'text-green-800 dark:text-green-200',
      border: 'border-green-300 dark:border-green-700',
    },
  };

  const cfg = config[classification];
  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border} ${sizeClasses}`}
      title={reason || cfg.label}
    >
      <span>{cfg.icon}</span>
      <span className="font-medium">{cfg.label}</span>
    </span>
  );
}
