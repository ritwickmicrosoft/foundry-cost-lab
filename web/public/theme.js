(() => {
  const parameter = new URLSearchParams(window.location.search).get('clawpilotTheme')
  const theme = parameter || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  document.documentElement.setAttribute('data-theme', theme)
})()