import { setupWorker } from 'msw/browser'
import { handlers } from '@/mocks/handlers'

async function canRegisterServiceWorker() {
  if (!('serviceWorker' in navigator)) return false
  try {
    await navigator.serviceWorker.register('/mockServiceWorker.js')
    return true
  } catch {
    return false
  }
}

export async function startMocking() {
  // 서비스 워커 등록을 막는 브라우저(앱 내장 미리보기 등)에서는
  // MSW가 서비스 워커 없이 페이지 안의 fetch를 가로채는 방식으로 돈다.
  if (!(await canRegisterServiceWorker())) {
    delete (Navigator.prototype as { serviceWorker?: unknown }).serviceWorker
  }
  await setupWorker(...handlers).start({ onUnhandledFrame: 'bypass', quiet: true })
}
