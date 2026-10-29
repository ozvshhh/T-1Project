import { Route, Routes } from 'react-router-dom'
import Layout from '@/components/Layout'
import NotFound from '@/pages/NotFound'

// 화면은 specs/ 순서대로 하나씩 추가한다.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
