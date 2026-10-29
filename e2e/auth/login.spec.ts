import { expect, test, type Page } from "@playwright/test"
import { E2E_USER_EMAIL, E2E_USER_PASSWORD } from "../env"

/**
 * 계정 기능(R1, C3) 확인용 추가 spec이다. docs/scenarios.yaml의 흐름(S1~S6)이 아니라서 주최 측 채점에는 쓰이지 않고,
 * 로컬·CI(`npx playwright test`)에서만 돈다. S 규칙을 똑같이 지킨다: 화면 조작만 쓰고 API를 직접 부르지 않는다.
 * 서버 오류 문구는 서버가 정한다(401 INVALID_CREDENTIALS 등). 문구 전체가 아니라 앞부분으로 확인한다.
 */

/** 첫 화면(/)에서 '로그인'을 눌러 로그인 화면으로 간다. */
async function openLogin(page: Page) {
  await page.goto("/")
  await page.getByRole("main").getByRole("link", { name: "로그인" }).click()
}

async function submitLogin(page: Page, email: string, password: string) {
  await page.getByLabel("이메일").fill(email)
  await page.getByLabel("비밀번호").fill(password)
  await page.getByRole("button", { name: "로그인" }).click()
}

test("시드 계정으로 로그인하면 홈(자소서 목록)이 열린다", async ({ page }) => {
  await openLogin(page)
  await submitLogin(page, E2E_USER_EMAIL, E2E_USER_PASSWORD)

  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible()
  await expect(page).toHaveURL(/\/cover-letters$/)
})

test("이메일 대소문자·앞뒤 공백이 달라도 같은 계정으로 로그인된다", async ({ page }) => {
  await openLogin(page)
  await submitLogin(page, `  ${E2E_USER_EMAIL.toUpperCase()} `, E2E_USER_PASSWORD)

  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible()
})

test("틀린 비밀번호면 오류가 보이고 로그인되지 않는다", async ({ page }) => {
  await openLogin(page)
  await submitLogin(page, E2E_USER_EMAIL, "wrong-password-0000")

  await expect(page.getByRole("alert")).toContainText("이메일 또는 비밀번호")
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole("button", { name: "로그아웃" })).toHaveCount(0)
})

test("없는 이메일도 틀린 비밀번호와 같은 오류가 보인다(가입 여부를 알려 주지 않는다)", async ({
  page,
}) => {
  await openLogin(page)
  await submitLogin(page, E2E_USER_EMAIL, "wrong-password-0000")
  const wrongPassword = await page.getByRole("alert").innerText()

  await submitLogin(page, `nobody-${Date.now()}@example.com`, "wrong-password-0000")
  await expect(page.getByRole("alert")).toHaveText(wrongPassword)
  await expect(page.getByRole("button", { name: "로그아웃" })).toHaveCount(0)
})

test("칸을 비운 채 로그인하면 입력 오류가 보이고 이동하지 않는다", async ({ page }) => {
  await openLogin(page)
  await page.getByRole("button", { name: "로그인" }).click()

  await expect(page.getByRole("alert")).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test("새로고침해도 로그인이 유지된다", async ({ page }) => {
  await openLogin(page)
  await submitLogin(page, E2E_USER_EMAIL, E2E_USER_PASSWORD)
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible()

  await page.reload()

  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible()
  await expect(page).toHaveURL(/\/cover-letters$/)
})

test("로그아웃하면 로그인이 풀려 로그인 필요한 주소가 로그인 화면으로 간다", async ({ page }) => {
  await openLogin(page)
  await submitLogin(page, E2E_USER_EMAIL, E2E_USER_PASSWORD)
  await page.getByRole("button", { name: "로그아웃" }).click()
  await expect(page.getByRole("button", { name: "로그아웃" })).toHaveCount(0)

  await page.goto("/experiences")
  await expect(page).toHaveURL(/\/login$/)
})

// frontend/specs/00-common.md: 「로그아웃: 토큰을 지우고 `/`로 간다」.
test("로그아웃하면 첫 화면(/)으로 간다", async ({ page }) => {
  await openLogin(page)
  await submitLogin(page, E2E_USER_EMAIL, E2E_USER_PASSWORD)
  await page.getByRole("button", { name: "로그아웃" }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("main").getByRole("link", { name: "가입하기" })).toBeVisible()
})

test("로그인 전 보호 주소로 오면 로그인 뒤 원래 주소로 돌아간다", async ({ page }) => {
  await page.goto("/experiences")
  await expect(page).toHaveURL(/\/login$/)

  await submitLogin(page, E2E_USER_EMAIL, E2E_USER_PASSWORD)

  await expect(page).toHaveURL(/\/experiences$/)
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible()
})

test("이미 가입된 이메일로 가입하면 오류가 보인다", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("main").getByRole("link", { name: "가입하기" }).click()
  await page.getByLabel("이메일").fill(E2E_USER_EMAIL)
  await page.getByLabel("비밀번호").fill("e2e-password-2026")
  await page.getByRole("button", { name: "가입하기" }).click()

  await expect(page.getByRole("alert")).toContainText("이미 가입된 이메일")
  await expect(page.getByRole("button", { name: "로그아웃" })).toHaveCount(0)
})

test("가입한 계정으로 로그아웃 뒤 다시 로그인할 수 있다", async ({ page }) => {
  const email = `e2e-login-${Date.now()}@example.com`
  const password = "e2e-password-2026"

  await page.goto("/")
  await page.getByRole("main").getByRole("link", { name: "가입하기" }).click()
  await page.getByLabel("이메일").fill(email)
  await page.getByLabel("비밀번호").fill(password)
  await page.getByRole("button", { name: "가입하기" }).click()
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible()
  await page.getByRole("button", { name: "로그아웃" }).click()

  await page.getByRole("link", { name: "로그인" }).first().click()
  await submitLogin(page, email, password)

  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible()
  await expect(page).toHaveURL(/\/cover-letters$/)
})
