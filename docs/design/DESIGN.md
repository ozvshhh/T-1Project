---
version: alpha
name: "T-1Project Style"
description: "흑백 캔버스 위에 파스텔 컬러 블록을 '붙인' 스타일. 화면의 뼈대는 순수 흰색·검정·알약 버튼으로 조용하게 두고, 색은 서비스 흐름의 단계 구분과 마지막 CTA에만 씁니다. 크고 가벼운(400) 헤드라인이 특징입니다."

colors:
  canvas: "#FFFFFF"
  ink: "#000000"
  ink-inverse: "#FFFFFF"
  block-lime: "#DCEEB1"     # 단계 1
  block-lilac: "#C5B0F4"    # 단계 2
  block-cream: "#F4ECD6"    # 단계 3
  block-coral: "#F3C9B6"    # CTA
  block-pink: "#EFD4D4"     # 검정 띠 위 보조 라벨
  success: "#1EA64A"        # 완료 체크
  hairline-dark: "#333333"  # 검정 띠 안 구분선

typography:
  font-ko: "'Wanted Sans Variable', system-ui, sans-serif"
  font-latin: "Inter"
  stack: "'Inter', 'Wanted Sans Variable', sans-serif"
  display:
    fontSize: "clamp(48px, 7.4vw, 104px)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: -0.045em
  heading-1:
    fontSize: "clamp(40px, 6vw, 80px)"
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: -0.045em
  heading-2:
    fontSize: "clamp(36px, 5vw, 64px)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: -0.04em
  card-title:
    fontSize: 26px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: -0.02em
  stat:
    fontSize: "clamp(88px, 9vw, 120px)"
    fontWeight: 300
    lineHeight: 0.9
    letterSpacing: -0.06em
  body-lg:
    fontSize: 20px
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontSize: 15px
    fontWeight: 600
  caption:
    fontSize: 13px
    fontWeight: 400
  button:
    fontSize: 17px
    fontWeight: 400

rounded:
  check: 6px
  row: 8px
  card-inner: 16px
  block: 24px
  pill: 50px

spacing:
  container: 1280px
  gutter: 24px
  block-gap: 16px
  section-gap: 24px
  block-padding: 28px
  band-padding: "clamp(32px, 6vw, 72px)"

components:
  nav-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-inverse}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    minHeight: 52px
    padding: "0 28px"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.ink}"
    rounded: "{rounded.pill}"
    minHeight: 52px
  button-nav:
    rounded: "{rounded.pill}"
    minHeight: 44px
    padding: "0 18px"
  color-block:
    rounded: "{rounded.block}"
    padding: "{spacing.block-padding}"
    minHeight: 380px
  list-row:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.row}"
    padding: "11px 12px"
  list-row-pending:
    backgroundColor: transparent
    outline: "2px dashed {colors.ink}"
    outlineOffset: -2px
    rounded: "{rounded.row}"
  progress-meter:
    cellHeight: 14px
    cellGap: 4px
    cellBorder: "1.5px solid {colors.ink}"
    filled: "{colors.ink}"
    empty: transparent
  inner-card:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.card-inner}"
    padding: 18px
  toggle-button:
    rounded: "{rounded.pill}"
    minHeight: 48px
    off: "흰 배경 + 검정 테두리"
    on: "검정 배경 + 흰 글자, 체크박스 {colors.success}"
  inverse-band:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-inverse}"
    rounded: "{rounded.block}"
    padding: "{spacing.band-padding}"
  cta-block:
    backgroundColor: "{colors.block-coral}"
    rounded: "{rounded.block}"
    padding: "{spacing.band-padding}"
---

# T-1Project 스타일 가이드 (DESIGN.md)

> **이 문서는 스타일(색·글꼴·모양·간격)만 정합니다.** 화면에 무엇을 보여 줄지, 어떤 기능이 있는지는 `docs/problem.yaml`과 `frontend/specs/`를 따릅니다.
> 견본 화면: [`style-reference.html`](style-reference.html) — 브라우저로 열면 컴포넌트가 실제로 어떻게 보이는지 확인할 수 있어요. 글자는 모두 자리표시자예요.

## 1. 콘셉트

흑백으로 조용한 바탕 위에 파스텔 색 블록을 스티커처럼 붙입니다. 색은 장식이 아니라 **흐름의 단계를 구분하는 표시**예요. 사용자는 색만 보고도 지금 몇 번째 단계에 있는지 알 수 있어야 합니다.

## 2. 색

| 토큰 | 값 | 역할 |
|---|---|---|
| `canvas` | #FFFFFF | 바탕, 블록 안 흰 행·카드 |
| `ink` | #000000 | 모든 글자, 주 버튼, 검정 띠 |
| `block-lime` | #DCEEB1 | **단계 1** |
| `block-lilac` | #C5B0F4 | **단계 2** |
| `block-cream` | #F4ECD6 | **단계 3** |
| `block-coral` | #F3C9B6 | 마지막 CTA 블록 |
| `success` | #1EA64A | 완료 체크박스만 |

- 단계와 색의 짝은 기능 명세가 정해지면 한 번 정하고, 모든 화면에서 똑같이 씁니다. 한 색을 두 가지 뜻으로 쓰지 않아요.
- 그라데이션, 그림자, 반투명 유리 효과는 쓰지 않아요. 깊이는 **색 블록끼리의 대비**로만 만들어요.
- 파스텔 블록 위 글자는 항상 `ink`(검정)예요. 흰 글자는 검정 띠와 검정 버튼 위에서만 써요.

## 3. 글꼴

- **한글:** 원티드 산스 (`Wanted Sans Variable`, SIL OFL 1.1, 상업적 사용 무료)
- **영문·숫자:** Inter
- 폰트 스택은 `'Inter', 'Wanted Sans Variable', sans-serif`예요. Inter에는 한글이 없어서 한글은 자동으로 원티드 산스로 나와요.
- **모든 화면 루트에 `word-break: keep-all`을 적용해요.** 한글이 단어 중간에서 끊기면 안 돼요.
- 헤드라인은 **크고 가볍게(400)** 써요. 굵은(700 이상) 대형 헤드라인은 쓰지 않아요.
- 큰 숫자는 Inter 300, 자간 -0.06em으로 써요.
- 원티드 산스의 가장 얇은 굵기는 400이에요. 한글에 300을 지정해도 400으로 보여요.

설치 (`frontend/`에서):

```bash
npm i wanted-sans
```

```ts
// src/main.tsx
import 'wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.css';
```

Inter는 `index.html`에서 Google Fonts로 불러와요 (`family=Inter:wght@300..700`).

## 4. 모양과 간격

- **모서리:** 알약 50px(버튼) · 블록 24px · 블록 안 카드 16px · 목록 행 8px · 체크박스 6px. 이 다섯 값 외에는 쓰지 않아요.
- **레이아웃:** 최대 너비 1280px, 좌우 여백 24px. 블록 사이 간격 16px, 섹션 사이 간격 24px.
- **블록 그리드:** `repeat(auto-fit, minmax(300px, 1fr))`. 폰에서는 한 줄에 하나씩 쌓여요.
- **큰 띠(검정·코럴) 안쪽 여백:** `clamp(32px, 6vw, 72px)`

## 5. 컴포넌트

### 버튼
- **주 버튼:** 검정 알약, 흰 글자, 높이 52px. 한 화면에 하나만 둬요.
- **보조 버튼:** 흰 알약에 검정 1px 테두리.
- **헤더 버튼:** 높이 44px (터치할 수 있는 최소 크기).

### 컬러 블록
- 단계 하나 = 블록 하나. 위쪽에 `단계 번호 + 이름`(label), 그 아래 한 줄 설명(card-title), 아래쪽에 내용을 둬요.
- 블록 안 내용은 흰 행이나 흰 카드로 올려요.

### 목록 행 — 점선 = 아직 안 된 것
- **완료/확인된 항목:** 흰 배경 행.
- **아직 비어 있는 항목:** 배경 없이 **2px 검정 점선 테두리**.
- 상태가 바뀌면 점선 행이 흰 행으로 바뀌어요. 이 전환으로 진행을 보여 줘요.

### 진행 막대 (progress-meter)
- 칸 여러 개, 칸마다 검정 1.5px 테두리. 채운 칸은 검정, 빈 칸은 투명이에요.
- 큰 숫자와 함께 쓰고, 그 아래에 숫자가 어떻게 나왔는지 한 줄로 적어요.

### 토글 버튼
- 꺼짐: 흰 알약 + 빈 체크박스
- 켜짐: 검정 알약 + 초록(`success`) 체크박스
- `aria-pressed`로 상태를 표시하고, 함께 바뀌는 숫자에는 `aria-live="polite"`를 달아요.

### 검정 띠 / 코럴 CTA 블록
- 검정 띠는 서비스의 원칙이나 핵심 메시지를 말할 때만 써요.
- 코럴 블록은 페이지 맨 끝 CTA에만 한 번 써요.

## 6. 하지 말 것 (AI 티 방지)

- ❌ 가운데 정렬 히어로 + 알약 배지 + 그림자 카드 3장 조합
- ❌ 그라데이션 배경, 글로우, 반투명 유리 카드
- ❌ 이모지, 반짝이 아이콘
- ❌ 굵은(700 이상) 대형 헤드라인
- ❌ 정해진 다섯 값 밖의 모서리, 표에 없는 색
- ❌ 근거 없는 숫자, 지어낸 통계, 가짜 후기
- ❌ 한 화면에 검정 주 버튼 두 개 이상

## 7. 반응형

- 1440 데스크톱과 390 폰에서 모두 확인해요. 폰 너비에서 가로 스크롤이 생기면 안 돼요.
- 헤더는 `flex-wrap`으로 줄바꿈되고, 블록 그리드는 한 줄에 하나씩 쌓여요.
- 헤드라인과 큰 숫자는 `clamp()`로 줄어들어요.

## 8. AI 코딩 도구에게 줄 지시문

> UI 스타일은 `docs/design/DESIGN.md`를 따른다. 색·글꼴·모서리·간격은 이 문서의 토큰만 쓰고, 새 값이 필요하면 만들지 말고 먼저 제안해라. 화면에 넣을 내용과 기능은 `docs/problem.yaml`과 `frontend/specs/`에 있는 것만 구현한다.
