// Dark mode is permanent — no toggle
document.documentElement.classList.add('dark')
try { localStorage.removeItem('studyedge_theme') } catch {}

export function useTheme() {
  return { theme: 'dark', toggleTheme: () => {}, isDark: true }
}
