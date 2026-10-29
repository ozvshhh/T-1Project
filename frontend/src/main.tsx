import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import 'wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.css'
import App from '@/App'
import { AuthProvider } from '@/auth/AuthProvider'
import '@/index.css'

// 백엔드가 붙기 전까지 개발 서버에서는 목 API(MSW)를 쓴다. 끄려면 VITE_API_MOCK=false.
async function enableMocking() {
  if (!import.meta.env.DEV || import.meta.env.VITE_API_MOCK === 'false') return
  const { startMocking } = await import('@/mocks/browser')
  await startMocking()
}

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>,
  )
})
