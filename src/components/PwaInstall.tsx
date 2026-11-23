import { useEffect, useState } from 'react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function PwaInstall() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [ios, setIos] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true
    setInstalled(standalone)
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    setIos(isIos && !standalone)

    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setInstallEvent(null)
      setHelpOpen(false)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
      void navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('PWA service worker registration failed', error)
      })
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return null

  const install = async () => {
    if (!installEvent) {
      setHelpOpen(true)
      return
    }
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') setInstallEvent(null)
  }

  return (
    <>
      <button className="pwa-install-button" type="button" onClick={() => void install()}>
        <span aria-hidden="true">↓</span> Install app
      </button>
      {helpOpen && (
        <div className="pwa-help-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setHelpOpen(false)
        }}>
          <section className="pwa-help" role="dialog" aria-modal="true" aria-labelledby="pwa-help-title">
            <button className="pwa-help-close" type="button" aria-label="Close" onClick={() => setHelpOpen(false)}>×</button>
            <span className="pwa-help-kicker">TAKE US WITH YOU</span>
            <h2 id="pwa-help-title">Install Drinking Buddies</h2>
            {ios ? (
              <ol>
                <li>Open this page in Safari.</li>
                <li>Tap the Share button.</li>
                <li>Choose <b>Add to Home Screen</b>, then tap Add.</li>
              </ol>
            ) : (
              <ol>
                <li>Open your browser menu (⋮).</li>
                <li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li>
                <li>Confirm. Drinking Buddies will appear with your other apps.</li>
              </ol>
            )}
            {installEvent && <button className="pwa-help-action" type="button" onClick={() => void install()}>Install now</button>}
          </section>
        </div>
      )}
    </>
  )
}
