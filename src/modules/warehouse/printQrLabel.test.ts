import { describe, expect, it } from 'vitest'
import { renderQrLabel } from './printQrLabel'

describe('renderQrLabel', () => {
  it('renders asset data as text instead of executable markup', () => {
    const document = window.document.implementation.createHTMLDocument('QR label')

    renderQrLabel(document, {
      id: 'asset-123',
      modelName: '<img src=x onerror=alert(1)>',
      serialNumber: '</div><script>alert(1)</script>',
      qrCodeUrl: 'data:image/png;base64,ZmFrZQ==',
    })

    expect(document.querySelector('script')).toBeNull()
    expect(document.querySelectorAll('img')).toHaveLength(1)
    expect(document.body.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(document.body.textContent).toContain('</div><script>alert(1)</script>')
  })

  it('rejects non-PNG data URLs for the QR image', () => {
    const document = window.document.implementation.createHTMLDocument('QR label')

    expect(() => renderQrLabel(document, {
      id: 'asset-123',
      modelName: 'Generator',
      serialNumber: 'GEN-001',
      qrCodeUrl: 'javascript:alert(1)',
    })).toThrow('QR label could not be printed.')
  })
})
