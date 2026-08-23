import { Download, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))

export function PwaControls() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  useEffect(() => {
    if (isStandalone()) return
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const handleInstalled = () => setInstallPrompt(null)
    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  if (needRefresh) {
    return (
      <button
        type="button"
        className="icon-button"
        aria-label="Update Foundry Cost Lab"
        title="Update Foundry Cost Lab"
        onClick={() => void updateServiceWorker(true)}
      >
        <RefreshCw aria-hidden="true" />
      </button>
    )
  }

  if (!installPrompt) return null

  const install = async () => {
    const prompt = installPrompt
    setInstallPrompt(null)
    await prompt.prompt()
    await prompt.userChoice
  }

  return (
    <button
      type="button"
      className="icon-button"
      aria-label="Install Foundry Cost Lab"
      title="Install Foundry Cost Lab"
      onClick={() => void install()}
    >
      <Download aria-hidden="true" />
    </button>
  )
}