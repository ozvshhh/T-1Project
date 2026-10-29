// /__health 로 rewrite 된다 (vercel.json). releaseId 는 Vercel 이 빌드·런타임에 주입하는 실제 commit SHA.
export function GET() {
  return Response.json(
    { releaseId: process.env.VERCEL_GIT_COMMIT_SHA ?? '' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
