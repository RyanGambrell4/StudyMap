const SIZE_MAP = {
  xs: { d: 14, b: 2 },
  sm: { d: 18, b: 2 },
  md: { d: 28, b: 3 },
  lg: { d: 44, b: 3 },
  xl: { d: 64, b: 4 },
}

export default function Spinner({ size = 'md', color = '#3B61C4', track = 'rgba(0,0,0,0.08)', className = '', style = {} }) {
  const { d, b } = SIZE_MAP[size] ?? SIZE_MAP.md
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`inline-block rounded-full animate-spin ${className}`}
      style={{
        width: d, height: d,
        border: `${b}px solid ${track}`,
        borderTopColor: color,
        ...style,
      }}
    />
  )
}
