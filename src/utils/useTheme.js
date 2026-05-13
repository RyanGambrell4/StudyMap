// App is light mode — remove any stale dark class
document.documentElement.classList.remove('dark')
try { localStorage.removeItem('studyedge_theme') } catch {}

export function useTheme() {
  return { theme: 'light', toggleTheme: () => {}, isDark: false }
}
