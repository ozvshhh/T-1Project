import { Route, Routes } from 'react-router-dom'
import { RequireAuth } from '@/components/guards'
import Layout from '@/components/Layout'
import AuthPage from '@/pages/AuthPage'
import Home from '@/pages/Home'
import Intro from '@/pages/Intro'
import NotFound from '@/pages/NotFound'

// 화면은 specs/ 순서대로 하나씩 추가한다.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Intro />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route element={<RequireAuth />}>
          <Route path="/cover-letters" element={<Home />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
