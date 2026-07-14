interface QrLabelInput {
  id: string
  modelName: string
  serialNumber: string
  qrCodeUrl: string
}

const qrDataUrlPattern = /^data:image\/png;base64,[a-z0-9+/]+=*$/i

function addDetail(document: Document, container: HTMLElement, label: string, value: string) {
  const strong = document.createElement('strong')
  strong.textContent = `${label}: `
  container.append(strong, document.createTextNode(value), document.createElement('br'))
}

export function renderQrLabel(document: Document, input: QrLabelInput) {
  if (!qrDataUrlPattern.test(input.qrCodeUrl)) {
    throw new Error('QR label could not be printed.')
  }

  document.title = `Print QR Label - ${input.serialNumber}`

  const style = document.createElement('style')
  style.textContent = `
    body { font-family: system-ui, sans-serif; display: flex; flex-direction: column;
      align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
    .label-card { border: 3px solid #000; border-radius: 12px; padding: 20px;
      max-width: 280px; background: #fff; }
    .title { font-weight: 800; font-size: 1.1rem; letter-spacing: 1px; margin-bottom: 5px; }
    .subtitle { font-size: 0.75rem; color: #555; text-transform: uppercase; margin-bottom: 15px; }
    img { width: 180px; height: 180px; }
    .details { font-family: monospace; font-size: 0.85rem; margin-top: 10px; word-break: break-all; }
  `
  document.head.append(style)

  const card = document.createElement('div')
  card.className = 'label-card'

  const title = document.createElement('div')
  title.className = 'title'
  title.textContent = 'EGYPRO ONEHUB'

  const subtitle = document.createElement('div')
  subtitle.className = 'subtitle'
  subtitle.textContent = 'Property Identification Tag'

  const image = document.createElement('img')
  image.src = input.qrCodeUrl
  image.alt = 'QR code'

  const details = document.createElement('div')
  details.className = 'details'
  addDetail(document, details, 'MODEL', input.modelName)
  addDetail(document, details, 'SERIAL', input.serialNumber)
  addDetail(document, details, 'ASSET ID', input.id)

  card.append(title, subtitle, image, details)
  document.body.replaceChildren(card)
}
