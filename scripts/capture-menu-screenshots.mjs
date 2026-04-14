import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'

const baseUrl = process.env.ARTEMIS_BASE_URL
const demoWorkspaceRoot =
  process.env.ARTEMIS_SCREENSHOT_WORKSPACE ?? 'C:\\Users\\Public\\ArtemisDemoWorkspace'

if (!baseUrl) {
  console.error('ARTEMIS_BASE_URL 환경 변수가 필요합니다.')
  process.exit(1)
}

const outputDir = path.resolve('docs', 'screenshots')

const pages = [
  { id: 'chat', file: 'chat.png', waitForText: '채팅' },
  { id: 'files', file: 'files.png', waitForText: '내 파일', prepare: 'files' },
  { id: 'insights', file: 'insights.png', waitForText: '인사이트' },
  { id: 'signals', file: 'signals.png', waitForText: '시그널', prepare: 'signals' },
  { id: 'tools', file: 'skills.png', waitForText: '스킬' },
  { id: 'agents', file: 'orchestration.png', waitForText: '오케스트레이션' },
  { id: 'activity', file: 'activity.png', waitForText: '활동' },
  { id: 'settings', file: 'settings.png', waitForText: '설정' },
]

async function ensureDemoWorkspace() {
  await fs.mkdir(demoWorkspaceRoot, { recursive: true })
  await fs.mkdir(path.join(demoWorkspaceRoot, 'drafts'), { recursive: true })
  await fs.mkdir(path.join(demoWorkspaceRoot, 'references'), { recursive: true })

  await fs.writeFile(
    path.join(demoWorkspaceRoot, 'welcome-note.md'),
    ['# Artemis Demo Workspace', '', '이 폴더는 공개용 스크린샷 캡처를 위한 샘플 작업공간입니다.'].join('\n'),
    'utf8',
  )

  await fs.writeFile(
    path.join(demoWorkspaceRoot, 'todo.txt'),
    ['- 채팅으로 파일 수정 요청', '- 시그널 요약 정리', '- 오케스트레이션 흐름 점검'].join('\n'),
    'utf8',
  )

  await fs.writeFile(
    path.join(demoWorkspaceRoot, 'references', 'prompt-guide.md'),
    ['# Prompt Guide', '', '실행 전 목표와 출력 형식을 먼저 정리합니다.'].join('\n'),
    'utf8',
  )
}

await fs.mkdir(outputDir, { recursive: true })
await ensureDemoWorkspace()

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1600, height: 1100 },
  colorScheme: 'dark',
  deviceScaleFactor: 1,
})

await context.addInitScript((workspaceRoot) => {
  for (const key of [
    'artemis-runtime-state/v17',
    'artemis-runtime-state/v16',
    'artemis-runtime-state/v15',
    'artemis-runtime-state/v14',
    'artemis-runtime-state/v13',
  ]) {
    window.localStorage.removeItem(key)
  }
  window.localStorage.setItem(
    'artemis-workspace/v1',
    JSON.stringify({
      rootPath: workspaceRoot,
      currentPath: '',
    }),
  )
}, demoWorkspaceRoot)

const page = await context.newPage()

for (const item of pages) {
  await page.goto(`${baseUrl}/#/${item.id}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.crew-shell', { timeout: 20000 })
  await page.getByText(item.waitForText, { exact: false }).first().waitFor({ timeout: 20000 })

  if (item.prepare === 'files') {
    await page.getByText('welcome-note.md', { exact: false }).first().click()
    await page.waitForTimeout(500)
  }

  if (item.prepare === 'signals') {
    try {
      await page.locator('.signal-card--feed').first().waitFor({ timeout: 12000 })
    } catch {
      await page.waitForTimeout(6000)
    }
  }

  await page.locator('.crew-shell').screenshot({
    path: path.join(outputDir, item.file),
  })
}

await browser.close()

console.log(`스크린샷 저장 완료: ${outputDir}`)
