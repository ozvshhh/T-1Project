import { Route, Routes } from 'react-router-dom'
import Layout from '@/components/Layout'
import AuthPage from '@/pages/AuthPage'
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
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
