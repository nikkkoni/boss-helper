import type { events } from 'fetch-event-stream'

import { counter } from '@/message'

import { loader } from '.'

export class RequestError extends Error {
  statusCode?: number

  constructor(message: string) {
    super(message)
    this.name = '请求错误'
  }
}

function extractStatusCode(message: string) {
  const match = message.match(/状态码:\s*(\d{3})/)
  if (!match) {
    return undefined
  }
  return Number(match[1])
}

function isAbortLikeError(error: unknown) {
  const name = error instanceof Error ? error.name.toLowerCase() : ''
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()

  if (name === 'aborterror' || name === 'timeouterror') {
    return true
  }

  return [
    'the user aborted a request',
    'request aborted',
    'signal is aborted',
    '请求超时',
    'timed out',
    'timeout',
  ].some((token) => message.includes(token))
}

function toRequestError(error: unknown) {
  if (error instanceof RequestError) {
    return error
  }

  if (isAbortLikeError(error)) {
    return new RequestError('请求超时')
  }

  const message = error instanceof Error ? error.message : String(error)
  const requestError = new RequestError(message)
  const statusCode = extractStatusCode(message)
  if (statusCode != null) {
    requestError.statusCode = statusCode
  }
  return requestError
}
export type ResponseType = 'text' | 'json' | 'arraybuffer' | 'blob' | 'document' | 'stream'
export type ResponseData<TResponseType extends ResponseType> = TResponseType extends 'text'
  ? string
  : TResponseType extends 'arraybuffer'
    ? ArrayBuffer
    : TResponseType extends 'blob'
      ? Blob
      : TResponseType extends 'document'
        ? Document
        : TResponseType extends 'stream'
          ? ReadableStream<Uint8Array>
          : any

export type OnStream = (reader: ReturnType<typeof events>) => Promise<void>

async function parseResponse<TResponseType extends ResponseType>(
  response: Response,
  responseType: TResponseType,
): Promise<ResponseData<TResponseType>> {
  switch (responseType) {
    case 'text':
      return (await response.text()) as ResponseData<TResponseType>
    case 'arraybuffer':
      return (await response.arrayBuffer()) as ResponseData<TResponseType>
    case 'blob':
      return (await response.blob()) as ResponseData<TResponseType>
    case 'document': {
      const html = await response.text()
      return new DOMParser().parseFromString(html, 'text/html') as ResponseData<TResponseType>
    }
    case 'stream':
      if (!response.body) {
        throw new RequestError('没有响应流')
      }
      return response.body as ResponseData<TResponseType>
    case 'json':
    default:
      return (await response.json()) as ResponseData<TResponseType>
  }
}

interface GmXhrRequest<TContext, TResponseType extends ResponseType> {
  method?: string
  url: string
  headers?: Record<string, string>

  data?: string | URLSearchParams | FormData | ArrayBuffer | Blob | DataView | ReadableStream

  /**
   * @available tampermonkey
   */
  redirect?: `follow` | `error` | `manual`

  /**
   * @available tampermonkey
   */
  cookie?: string

  binary?: boolean

  /**
   * @available tampermonkey
   */
  nocache?: boolean

  /**
   * @available tampermonkey
   */
  revalidate?: boolean

  timeout?: number

  /**
   * Property which will be added to the response event object
   */
  context?: TContext

  /**
   * @tampermonkey  text, json, arraybuffer, blob, document, stream
   * @violentmonkey text, json, arraybuffer, blob, document
   * @default
   * 'text'
   */
  responseType?: TResponseType

  overrideMimeType?: string

  anonymous?: boolean

  /**
   * @available tampermonkey
   */
  fetch?: boolean

  user?: string

  password?: string

  onabort?: () => void

  onerror?: any

  /**
   * @available violentmonkey
   */
  onloadend?: any

  onloadstart?: any

  onprogress?: any

  onreadystatechange?: any

  ontimeout?: () => void

  onload?: any
}

export type RequestArgs<TContext, TResponseType extends ResponseType> = Partial<
  Pick<
    GmXhrRequest<TContext, TResponseType>,
    'method' | 'url' | 'data' | 'headers' | 'timeout' | 'responseType'
  > & {
    onStream: OnStream
    isBackground: boolean
  }
>

export async function request<TContext, TResponseType extends ResponseType = 'json'>(
  args: RequestArgs<TContext, TResponseType>,
): Promise<ResponseData<TResponseType>> {
  const {
    method = 'POST',
    url = '',
    data,
    headers = {},
    timeout = 18000,
    responseType = 'json' as TResponseType,
    isBackground = false,
  } = args

  const signal = AbortSignal.timeout(timeout)
  return new Promise<ResponseData<TResponseType>>((resolve, reject) => {
    const axiosLoad = loader({ ms: timeout, color: '#F79E63' })

    const requestData = {
      method,
      headers,
      body: data,
      referrerPolicy: 'no-referrer',
    } as RequestInit

    if (isBackground) {
      counter
        .request({ url, data: requestData, timeout, responseType })
        .then((res) => {
          if (res instanceof Error) {
            reject(toRequestError(res))
          } else {
            resolve(res)
          }
        })
        .catch((e) => {
          reject(toRequestError(e))
        })
        .finally(() => {
          axiosLoad()
        })
    } else {
      fetch(url, { ...requestData, signal })
        .then(async (response) => {
          if (responseType === 'stream' && !response.body) {
            reject(new RequestError('没有响应体'))
            return
          }
          if (!response.ok || response.status >= 400) {
            const errorText = await response.text()
            const error = new RequestError(
              `状态码: ${response.status}: ${errorText} | ${response.statusText}`,
            )
            error.statusCode = response.status
            reject(error)
            return
          }

          resolve(await parseResponse(response, responseType))
        })
        .catch((e) => {
          reject(toRequestError(e))
        })
        .finally(() => {
          axiosLoad()
        })
    }
  })
}

request.post = async <TContext, TResponseType extends ResponseType = 'json'>(
  args: Omit<RequestArgs<TContext, TResponseType>, 'method'>,
): Promise<ResponseData<TResponseType>> => {
  return request<TContext, TResponseType>({
    method: 'POST',
    ...args,
  })
}

request.get = async <TContext, TResponseType extends ResponseType = 'json'>(
  args: Omit<RequestArgs<TContext, TResponseType>, 'method'>,
): Promise<ResponseData<TResponseType>> => {
  return request<TContext, TResponseType>({
    method: 'GET',
    ...args,
  })
}
