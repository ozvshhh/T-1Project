import { Route, Routes } from 'react-router-dom'
import Layout from '@/components/Layout'
import AuthPage from '@/pages/AuthPage'
import CoverLetterDetail from '@/pages/cover-letters/CoverLetterDetail'
import CoverLetterNew from '@/pages/cover-letters/CoverLetterNew'
import CoverLetters from '@/pages/cover-letters/CoverLetters'
import Home from '@/pages/Home'
import InterviewResult from '@/pages/interview/InterviewResult'
import Interviews from '@/pages/interview/Interviews'
import InterviewSession from '@/pages/interview/InterviewSession'
import InterviewStart from '@/pages/interview/InterviewStart'
import NotFound from '@/pages/NotFound'
import Resume from '@/pages/Resume'

// 경로는 docs/develope/screen-spec.md 0절. 로그인 가드는 공통 기획이 나오면 붙인다.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/resume" element={<Resume />} />
        <Route path="/cover-letters" element={<CoverLetters />} />
        <Route path="/cover-letters/new" element={<CoverLetterNew />} />
        <Route path="/cover-letters/:id" element={<CoverLetterDetail />} />
        <Route path="/interview" element={<InterviewStart />} />
        <Route path="/interviews" element={<Interviews />} />
        <Route path="/interviews/:id" element={<InterviewSession />} />
        <Route path="/interviews/:id/result" element={<InterviewResult />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
