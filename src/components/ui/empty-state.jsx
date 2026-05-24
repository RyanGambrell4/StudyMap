export default function EmptyState({ icon, headline, sub, action, tone = 'neutral', compact = false, style = {} }) {
  const tones = {
    neutral: { iconColor: '#9B9B9B', iconBg: '#F0EFEC' },
    accent:  { iconColor: '#3B61C4', iconBg: 'rgba(59,97,196,0.1)' },
    success: { iconColor: '#16A34A', iconBg: 'rgba(22,163,74,0.1)' },
    warn:    { iconColor: '#D97706', iconBg: 'rgba(217,119,6,0.1)' },
  }
  const { iconColor, iconBg } = tones[tone] ?? tones.neutral
  const iconSize = compact ? 36 : 56

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        padding: compact ? '20px 16px' : '32px 24px',
        ...style,
      }}
    >
      {icon && (
        <div
          style={{
            width: iconSize, height: iconSize, borderRadius: compact ? 12 : 16,
            background: iconBg, color: iconColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: compact ? 10 : 14, flexShrink: 0,
          }}
        >
          {icon}
        </div>
      )}
      <h3 style={{ margin: 0, fontSize: compact ? 14 : 16, fontWeight: 600, color: '#111111' }}>{headline}</h3>
      {sub && <p style={{ margin: '4px 0 0', fontSize: compact ? 12 : 13, color: '#6B6B6B', lineHeight: 1.5, maxWidth: 320 }}>{sub}</p>}
      {action && <div style={{ marginTop: compact ? 12 : 16 }}>{action}</div>}
    </div>
  )
}
