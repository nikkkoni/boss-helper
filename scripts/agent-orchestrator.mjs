// @ts-check

import { pathToFileURL } from 'node:url'

import {
  createAgentBridgeAuthHeaders,
  getAgentBridgeRuntime,
} from './agent-security.mjs'

/** @typedef {import('./types.d.ts').AgentBridgeRuntime} AgentBridgeRuntime */
/** @typedef {import('./types.d.ts').AgentOrchestratorOptions} AgentOrchestratorOptions */
/** @typedef {import('./types.d.ts').AgentReviewMode} AgentReviewMode */

function printUsage() {
  console.log(`boss-helper agent orchestrator

usage:
  node ./scripts/agent-orchestrator.mjs --query 前端 --include vue,react --start --watch
  node ./scripts/agent-orchestrator.mjs --url 'https://www.zhipin.com/web/geek/job?query=java' --detail-limit 8

options:
  --host <host>                default 127.0.0.1
  --port <port>                default 4317
  --url <url>                  navigate to a full Boss job URL first
  --query <query>              search keyword for navigate
  --city <city>                city for navigate
  --position <position>        position for navigate
  --page <n>                   page for navigate
  --settle-ms <ms>             wait after navigate, default 4000
  --job-limit <n>              max jobs to consider from jobs.list, default 10
  --detail-limit <n>           max jobs to fetch detail for, default 5
  --include <a,b>              positive keywords
  --exclude <a,b>              negative keywords
  --min-score <n>              minimum score to start/review accept, default 1
  --start                      start targeted delivery for selected jobs
  --watch                      subscribe agent-events while running
  --watch-ms <ms>              stop watching after timeout, default 180000
  --review-mode <mode>         none | heuristic | accept | reject, default heuristic
  --greeting-template <text>   template for accepted review greeting, supports {{jobName}} {{brandName}}
  --print-resume               print resume text summary
   --help                       show help`)
}

function getResponseData(data) {
  return data && typeof data === 'object' ? data.data : undefined
}

/** @param {string | undefined} value */
function parseList(value) {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

/** @param {string | undefined} value @returns {AgentReviewMode} */
function normalizeReviewMode(value) {
  if (value === 'none' || value === 'accept' || value === 'reject') {
    return value
  }
  return 'heuristic'
}

/** @param {string[]} argv @returns {AgentOrchestratorOptions} */
export function parseArgs(argv) {
  /** @type {AgentOrchestratorOptions} */
  const options = {
    host: '127.0.0.1',
    port: 4317,
    url: '',
    query: '',
    city: '',
    position: '',
    page: undefined,
    settleMs: 4000,
    jobLimit: 10,
    detailLimit: 5,
    include: [],
    exclude: [],
    minScore: 1,
    start: false,
    watch: false,
    watchMs: 180000,
    reviewMode: 'heuristic',
    greetingTemplate: '',
    printResume: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const next = argv[index + 1]

    if (token === '--help' || token === '-h') {
      options.help = true
      continue
    }
    if (token === '--host' && next) {
      options.host = next
      index += 1
      continue
    }
    if (token === '--port' && next) {
      options.port = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if (token === '--url' && next) {
      options.url = next
      index += 1
      continue
    }
    if (token === '--query' && next) {
      options.query = next
      index += 1
      continue
    }
    if (token === '--city' && next) {
      options.city = next
      index += 1
      continue
    }
    if (token === '--position' && next) {
      options.position = next
      index += 1
      continue
    }
    if (token === '--page' && next) {
      options.page = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if (token === '--settle-ms' && next) {
      options.settleMs = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if (token === '--job-limit' && next) {
      options.jobLimit = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if (token === '--detail-limit' && next) {
      options.detailLimit = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if (token === '--include' && next) {
      options.include = parseList(next)
      index += 1
      continue
    }
    if (token === '--exclude' && next) {
      options.exclude = parseList(next)
      index += 1
      continue
    }
    if (token === '--min-score' && next) {
      options.minScore = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if (token === '--review-mode' && next) {
      options.reviewMode = normalizeReviewMode(next)
      index += 1
      continue
    }
    if (token === '--greeting-template' && next) {
      options.greetingTemplate = next
      index += 1
      continue
    }
    if (token === '--watch-ms' && next) {
      options.watchMs = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if (token === '--start') {
      options.start = true
      continue
    }
    if (token === '--watch') {
      options.watch = true
      continue
    }
    if (token === '--print-resume') {
      options.printResume = true
      continue
    }
  }

  return options
}

const options = parseArgs(process.argv.slice(2))

/** @returns {string} */
function buildBaseUrl() {
  return `http://${options.host}:${options.port}`
}

/** @returns {AgentBridgeRuntime} */
function getBridgeRuntime() {
  return getAgentBridgeRuntime({
    ...process.env,
    BOSS_HELPER_AGENT_HOST: options.host,
    BOSS_HELPER_AGENT_PORT: String(options.port),
  })
}

async function requestJson(path, init = undefined) {
  const response = await fetch(`${buildBaseUrl()}${path}`, {
    ...init,
    headers: createAgentBridgeAuthHeaders(getBridgeRuntime().token, init?.headers ?? {}),
  })
  const data = await response.json()
  return { response, data }
}

async function sendCommand(command, payload = undefined, timeoutMs = undefined) {
  const { response, data } = await requestJson('/command', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      command,
      payload,
      timeoutMs,
    }),
  })

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.message || `command failed: ${command}`)
  }

  return data
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toKeywordItems(items, score) {
  return items.map((item) => ({
    reason: item,
    score,
  }))
}

function analyzeJob(detail) {
  const job = detail.job
  const text = [
    job.jobName,
    job.brandName,
    job.brandIndustry,
    job.postDescription,
    ...(job.skills ?? []),
    ...(job.jobLabels ?? []),
    ...(job.welfareList ?? []),
  ]
    .join('\n')
    .toLowerCase()

  const positiveMatches = options.include.filter((keyword) => text.includes(keyword.toLowerCase()))
  const negativeMatches = options.exclude.filter((keyword) => text.includes(keyword.toLowerCase()))

  let score = 0
  if (positiveMatches.length > 0) {
    score += positiveMatches.length * 10
  }
  if (options.include.length > 0 && positiveMatches.length === 0) {
    score -= 5
  }
  if (negativeMatches.length > 0) {
    score -= negativeMatches.length * 50
  }

  return {
    accepted: score >= options.minScore,
    detail,
    score,
    positive: toKeywordItems(positiveMatches, 10),
    negative: toKeywordItems(negativeMatches, 50),
    reason:
      negativeMatches.length > 0
        ? `命中排除关键词: ${negativeMatches.join(', ')}`
        : positiveMatches.length > 0
          ? `命中包含关键词: ${positiveMatches.join(', ')}`
          : '未命中特别关键词',
  }
}

function renderGreeting(job) {
  if (!options.greetingTemplate) {
    return undefined
  }

  return options.greetingTemplate
    .replaceAll('{{jobName}}', job.jobName || '')
    .replaceAll('{{brandName}}', job.brandName || '')
}

async function readJobs(detailLimit) {
  const jobsList = await sendCommand('jobs.list')
  const jobsListData = getResponseData(jobsList)
  const jobs = Array.isArray(jobsListData?.jobs)
    ? jobsListData.jobs.slice(0, Math.max(options.jobLimit, detailLimit))
    : []
  const details = []

  for (const summary of jobs.slice(0, detailLimit)) {
    try {
      const detail = await sendCommand('jobs.detail', {
        encryptJobId: summary.encryptJobId,
      }, 65_000)
      details.push(detail.data)
    } catch (error) {
      details.push({
        job: {
          ...summary,
          activeTimeDesc: '',
          address: '',
          brandIndustry: '',
          degreeName: '',
          experienceName: '',
          friendStatus: null,
          gps: null,
          postDescription: `DETAIL_ERROR: ${error instanceof Error ? error.message : String(error)}`,
        },
      })
    }
  }

  return {
    jobs,
    details,
  }
}

async function streamAgentEvents(onEvent) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.watchMs)
  const types = [
    'job-pending-review',
    'job-succeeded',
    'job-filtered',
    'job-failed',
    'batch-completed',
    'batch-error',
    'limit-reached',
    'rate-limited',
    'chat-sent',
  ].join(',')

  const response = await fetch(`${buildBaseUrl()}/agent-events?types=${encodeURIComponent(types)}`, {
    headers: {
      Accept: 'text/event-stream',
      ...createAgentBridgeAuthHeaders(getBridgeRuntime().token),
    },
    signal: controller.signal,
  })

  if (!response.ok || !response.body) {
    clearTimeout(timer)
    throw new Error('无法订阅 agent-events')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n')

      while (buffer.includes('\n\n')) {
        const delimiterIndex = buffer.indexOf('\n\n')
        const rawEvent = buffer.slice(0, delimiterIndex)
        buffer = buffer.slice(delimiterIndex + 2)

        let eventName = 'message'
        const dataLines = []

        for (const line of rawEvent.split('\n')) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim()
            continue
          }
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim())
          }
        }

        if (dataLines.length === 0) {
          continue
        }

        let payload
        try {
          payload = JSON.parse(dataLines.join('\n'))
        } catch {
          payload = dataLines.join('\n')
        }

        await onEvent({ event: eventName, data: payload, controller })
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      return
    }
    throw error
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

async function autoReviewPendingJob(eventPayload, detailsCache) {
  const encryptJobId = eventPayload?.detail?.encryptJobId || eventPayload?.job?.encryptJobId
  if (!encryptJobId || options.reviewMode === 'none') {
    return
  }

  let detail = detailsCache.get(encryptJobId)
  if (!detail) {
    const response = await sendCommand('jobs.detail', { encryptJobId }, 65_000)
    detail = response.data
    detailsCache.set(encryptJobId, detail)
  }

  const analysis = analyzeJob(detail)
  const accepted =
    options.reviewMode === 'accept'
      ? true
      : options.reviewMode === 'reject'
        ? false
        : analysis.accepted

  const payload = {
    accepted,
    encryptJobId,
    greeting: accepted ? renderGreeting(detail.job) : undefined,
    positive: analysis.positive,
    negative: analysis.negative,
    rating: analysis.score,
    reason: analysis.reason,
  }

  const reviewResponse = await sendCommand('jobs.review', payload)
  console.log(
    JSON.stringify(
      {
        type: 'review-submitted',
        encryptJobId,
        accepted,
        response: reviewResponse,
      },
      null,
      2,
    ),
  )
}

async function main() {
  if (options.help) {
    printUsage()
    return
  }

  const detailsCache = new Map()

  if (options.url || options.query || options.city || options.position || options.page != null) {
    await sendCommand('navigate', {
      url: options.url || undefined,
      query: options.query || undefined,
      city: options.city || undefined,
      position: options.position || undefined,
      page: options.page,
    })
    await sleep(options.settleMs)
  }

  const resume = await sendCommand('resume.get')
  const resumeData = getResponseData(resume) ?? {}
  const resumeText = typeof resumeData.resumeText === 'string' ? resumeData.resumeText : ''
  if (options.printResume) {
    console.log(resumeText)
  }

  const { jobs, details } = await readJobs(options.detailLimit)
  for (const detail of details) {
    detailsCache.set(detail.job.encryptJobId, detail)
  }

  const analyses = details.map(analyzeJob).sort((left, right) => right.score - left.score)
  const selected = analyses.filter((item) => item.accepted)

  console.log(
    JSON.stringify(
      {
        resume: {
          userId: resumeData.userId ?? null,
          resumeTextLength: resumeText.length,
        },
        jobsOnPage: jobs.length,
        analysed: analyses.map((item) => ({
          encryptJobId: item.detail.job.encryptJobId,
          jobName: item.detail.job.jobName,
          brandName: item.detail.job.brandName,
          score: item.score,
          accepted: item.accepted,
          reason: item.reason,
        })),
        selectedJobIds: selected.map((item) => item.detail.job.encryptJobId),
      },
      null,
      2,
    ),
  )

  let streamPromise = null
  if (options.watch) {
    streamPromise = streamAgentEvents(async ({ event, data, controller }) => {
      if (event === 'history') {
        console.log(JSON.stringify({ type: 'event-history', recent: data?.recent?.length ?? 0 }, null, 2))
        return
      }

      console.log(JSON.stringify({ type: 'event', event: data?.type, message: data?.message }, null, 2))

      if (data?.type === 'job-pending-review') {
        await autoReviewPendingJob(data, detailsCache)
      }

      if (data?.type === 'batch-completed' || data?.type === 'batch-error') {
        controller.abort()
      }
    })
  }

  if (options.start && selected.length > 0) {
    const startResponse = await sendCommand('start', {
      jobIds: selected.map((item) => item.detail.job.encryptJobId),
      resetFiltered: true,
    })
    console.log(JSON.stringify({ type: 'start', response: startResponse }, null, 2))
  }

  if (streamPromise) {
    await streamPromise
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.log(
      JSON.stringify(
        {
          ok: false,
          code: 'agent-orchestrator-failed',
          message: error instanceof Error ? error.message : 'unknown error',
        },
        null,
        2,
      ),
    )
    process.exitCode = 1
  })
}
