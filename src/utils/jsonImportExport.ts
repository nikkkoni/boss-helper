export class ImportJsonCancelledError extends Error {
  constructor(message = '已取消导入') {
    super(message)
    this.name = 'ImportJsonCancelledError'
  }
}

export function exportJson(data: object, name: string) {
  const blob = new Blob([JSON.stringify(data)], {
    type: 'application/json',
  })
  const link = document.createElement('a')
  const objectUrl = URL.createObjectURL(blob)
  link.href = objectUrl
  link.download = `${name}.json`
  link.click()
  URL.revokeObjectURL(objectUrl)
}

export async function importJson<T = any>(): Promise<T> {
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = '.json,application/json'

  return new Promise((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      window.removeEventListener('focus', handleFocus)
      fileInput.remove()
    }

    const finish = (callback: () => void) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      callback()
    }

    const handleFocus = () => {
      window.setTimeout(() => {
        if (!fileInput.files?.length) {
          finish(() => reject(new ImportJsonCancelledError()))
        }
      }, 0)
    }

    fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file || !file.name.endsWith('.json')) {
        finish(() => reject(new Error('请选择 JSON 文件')))
        return
      }

      const reader = new FileReader()
      reader.onerror = () => {
        finish(() => reject(new Error('读取文件失败')))
      }
      reader.onload = function (e) {
        try {
          const jsonData: T = JSON.parse(e.target!.result as string)

          const type = Object.prototype.toString.call(jsonData).slice(8, -1)
          if (!['Array', 'Object'].includes(type)) {
            finish(() => reject(new Error('JSON 内容必须是对象或数组')))
            return
          }
          finish(() => resolve(jsonData))
        } catch (error: any) {
          finish(() => reject(new Error(`内容非合法 JSON: ${error.message}`)))
        }
      }
      reader.readAsText(file)
    })

    fileInput.addEventListener('cancel', () => {
      finish(() => reject(new ImportJsonCancelledError()))
    })

    window.addEventListener('focus', handleFocus, { once: true })
    fileInput.click()
  })
}
