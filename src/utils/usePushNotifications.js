import { useState, useEffect } from 'react'
import { getAccessToken } from '../lib/supabase'

const LS_KEY = 'se_push_dismissed'
const LS_SUBSCRIBED_KEY = 'se_push_subscribed'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export function usePushNotifications(userId) {
  const [permission, setPermission] = useState(() =>
    'Notification' in window ? Notification.permission : 'unsupported'
  )
  const [subscribed, setSubscribed] = useState(
    () => localStorage.getItem(LS_SUBSCRIBED_KEY) === '1'
  )
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(LS_KEY) === '1'
  )

  useEffect(() => {
    if ('Notification' in window) setPermission(Notification.permission)
  }, [])

  const subscribe = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
    try {
      const reg = await navigator.serviceWorker.ready
      const keyRes = await fetch('/api/push-subscribe')
      const { publicKey } = await keyRes.json()
      if (!publicKey) return false

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      const token = await getAccessToken()
      await fetch('/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subscription }),
      })

      localStorage.setItem(LS_SUBSCRIBED_KEY, '1')
      setSubscribed(true)
      setPermission('granted')
      return true
    } catch {
      return false
    }
  }

  const requestAndSubscribe = async () => {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setPermission(perm)
    if (perm === 'granted') {
      await subscribe()
    }
  }

  const dismiss = () => {
    localStorage.setItem(LS_KEY, '1')
    setDismissed(true)
  }

  const shouldPrompt =
    permission === 'default' &&
    !subscribed &&
    !dismissed &&
    'PushManager' in window

  return { permission, subscribed, dismissed, shouldPrompt, requestAndSubscribe, dismiss }
}
