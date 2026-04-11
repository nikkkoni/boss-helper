export interface TechwolfUser {
  uid: number | string
  name?: string
  source?: number
}

export interface TechwolfImageInfo {
  url: string
  width: number
  height: number
}

export interface TechwolfImage {
  iid?: number | string
  tinyImage?: TechwolfImageInfo
  originImage?: TechwolfImageInfo
}

export interface TechwolfNotifyBody {
  text?: string
}

export interface TechwolfDialogBody {
  text?: string
}

export interface TechwolfInterviewBody {
  text?: string
}

export interface TechwolfHyperLinkBody {
  text?: string
}

export interface TechwolfJobDescBody {
  title?: string
}

export interface TechwolfResumeBody {
  position?: string
}

export interface TechwolfMessageBody {
  type: number
  templateId: number
  headTitle?: string
  text?: string
  image?: TechwolfImage
  notify?: TechwolfNotifyBody
  dialog?: TechwolfDialogBody
  hyperLink?: TechwolfHyperLinkBody
  interview?: TechwolfInterviewBody
  jobDesc?: TechwolfJobDescBody
  resume?: TechwolfResumeBody
  sound?: Record<string, unknown>
  sticker?: Record<string, unknown>
  video?: Record<string, unknown>
}

export interface TechwolfMessage {
  from: TechwolfUser
  to: TechwolfUser
  type?: number
  mid?: number | string
  time?: number | string
  body: TechwolfMessageBody
  cmid?: number | string
}

export interface TechwolfChatProtocol {
  type: number
  version?: string
  messages: TechwolfMessage[]
}
