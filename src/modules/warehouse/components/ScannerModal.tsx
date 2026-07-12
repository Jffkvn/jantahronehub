import { useEffect, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { inventoryApi, type StockRequest, type Warehouse } from '../api/inventory'
import { Camera, AlertCircle, CheckCircle2 } from 'lucide-react'

interface ScannerModalProps {
  open: boolean
  onClose: () => void
  onActionCompleted?: () => void
}

export function ScannerModal({ open, onClose, onActionCompleted }: ScannerModalProps) {
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [manualCode, setManualCode] = useState('')

  // Scanned item info
  const [scannedItem, setScannedItem] = useState<{
    id: string
    type: 'equipment' | 'consumable'
    name: string
    code: string
    status?: string
    is_sensitive?: boolean
    reorder_level?: number
  } | null>(null)

  // Options for checkout/return
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [approvedRequests, setApprovedRequests] = useState<StockRequest[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [selectedRequestId, setSelectedRequestId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)
  const [receiptRef, setReceiptRef] = useState('')

  // Return/Damage state
  const [returnCondition, setReturnCondition] = useState<'good' | 'damaged' | 'lost'>('good')
  const [actionNotes, setActionNotes] = useState('')

  const handleCodeResolved = async (code: string) => {
    setErrorMsg('')
    setSuccessMsg('')
    setScannedItem(null)
    setLoading(true)

    try {
      const parts = code.split(':')
      if (parts.length < 2) {
        // Fallback: search as serial number or SKU code
        const eqList = await inventoryApi.listEquipment()
        const matchedEq = eqList.find((e) => e.serial_number.toLowerCase() === code.trim().toLowerCase())
        if (matchedEq) {
          setScannedItem({
            id: matchedEq.id,
            type: 'equipment',
            name: matchedEq.model_name,
            code: matchedEq.serial_number,
            status: matchedEq.status,
            is_sensitive: matchedEq.is_sensitive
          })
          return
        }

        const conList = await inventoryApi.listConsumables()
        const matchedCon = conList.find((c) => c.sku.toLowerCase() === code.trim().toLowerCase())
        if (matchedCon) {
          setScannedItem({
            id: matchedCon.id,
            type: 'consumable',
            name: matchedCon.name,
            code: matchedCon.sku,
            reorder_level: matchedCon.reorder_level
          })
          return
        }

        throw new Error('Unrecognized code format or catalog code. Prefix with EQPT: or CONS: or enter valid SKU/Serial.')
      }

      const prefix = parts[0]
      const itemId = parts[1]

      if (prefix === 'EQPT') {
        const eqList = await inventoryApi.listEquipment()
        const matched = eqList.find((e) => e.id === itemId)
        if (!matched) throw new Error('Equipment asset not found.')
        setScannedItem({
          id: matched.id,
          type: 'equipment',
          name: matched.model_name,
          code: matched.serial_number,
          status: matched.status,
          is_sensitive: matched.is_sensitive
        })
      } else if (prefix === 'CONS') {
        const conList = await inventoryApi.listConsumables()
        const matched = conList.find((c) => c.id === itemId)
        if (!matched) throw new Error('Consumable SKU not found.')
        setScannedItem({
          id: matched.id,
          type: 'consumable',
          name: matched.name,
          code: matched.sku,
          reorder_level: matched.reorder_level
        })
      } else {
        throw new Error('Invalid QR code label prefix.')
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lookup failed.')
    } finally {
      setLoading(false)
    }
  }

  // Load select options
  useEffect(() => {
    if (!open) return
    inventoryApi.listWarehouses().then(setWarehouses).catch(console.error)
    inventoryApi.listRequests().then((reqs) => {
      setApprovedRequests(reqs.filter((r) => r.status === 'approved' || r.status === 'pending_approval'))
    }).catch(console.error)
  }, [open])

  // Lazy-load camera scan
  useEffect(() => {
    if (!open) return
    let html5Qrcode: {
      isScanning: boolean
      start: (
        cameraConfig: { facingMode: string },
        configuration: { fps: number; qrbox: { width: number; height: number } },
        qrCodeSuccessCallback: (decodedText: string) => void,
        qrCodeErrorCallback: () => void
      ) => Promise<null | void>
      stop: () => Promise<void>
    } | null = null

    // Give DOM a frame to mount viewport
    const timer = setTimeout(async () => {
      const container = document.getElementById('qr-reader-viewport')
      if (!container) return

      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        const scannerInstance = new Html5Qrcode('qr-reader-viewport')
        html5Qrcode = scannerInstance
        await scannerInstance.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 220, height: 220 },
          },
          (decodedText: string) => {
            scannerInstance.stop().then(() => {
              handleCodeResolved(decodedText)
            }).catch(console.error)
          },
          () => {}
        )
      } catch (err) {
        console.warn('Camera failed to start, using fallback scanner input:', err)
      }
    }, 200)

    return () => {
      clearTimeout(timer)
      if (html5Qrcode && html5Qrcode.isScanning) {
        html5Qrcode.stop().catch(console.error)
      }
    }
  }, [open])



  // Handle Handout/Issue (Fulfillment)
  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scannedItem || !selectedRequestId || !selectedWarehouseId) return
    setLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      await inventoryApi.issueStock(selectedRequestId, selectedWarehouseId)
      setSuccessMsg(`Successfully checked out/issued ${scannedItem.name} (${scannedItem.code})`)
      onActionCompleted?.()
      setTimeout(() => onClose(), 2000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Checkout failed.')
    } finally {
      setLoading(false)
    }
  }

  // Handle Returns
  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scannedItem || !selectedWarehouseId) return
    setLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      await inventoryApi.returnAsset(scannedItem.id, returnCondition, selectedWarehouseId, actionNotes)
      setSuccessMsg(`Successfully logged return of ${scannedItem.name} in ${returnCondition} condition.`)
      onActionCompleted?.()
      setTimeout(() => onClose(), 2000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Return logging failed.')
    } finally {
      setLoading(false)
    }
  }

  // Handle Goods Receipt (GRN) for Consumable
  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scannedItem || !selectedWarehouseId || !receiptRef || quantity <= 0) return
    setLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const items = [{
        consumable_item_id: scannedItem.id,
        quantity,
        unit_price: unitPrice
      }]
      await inventoryApi.receiveStock(selectedWarehouseId, receiptRef, items)
      setSuccessMsg(`Successfully received ${quantity} units of ${scannedItem.name}.`)
      onActionCompleted?.()
      setTimeout(() => onClose(), 2000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Stock receipt failed.')
    } finally {
      setLoading(false)
    }
  }

  // Handle Adjustment
  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scannedItem || !selectedWarehouseId || !actionNotes) return
    setLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      if (scannedItem.type === 'consumable') {
        await inventoryApi.adjustStock(selectedWarehouseId, scannedItem.id, null, quantity, actionNotes)
      } else {
        await inventoryApi.adjustStock(selectedWarehouseId, null, scannedItem.id, quantity, actionNotes)
      }
      setSuccessMsg(`Successfully adjusted stock quantity by ${quantity}.`)
      onActionCompleted?.()
      setTimeout(() => onClose(), 2000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Stock adjustment failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualCode.trim()) {
      void handleCodeResolved(manualCode.trim())
    }
  }

  return (
    <Modal open={open} title="Inventory Scanner & Quick Actions" onClose={onClose}>
      <div className="oh-form-stack" style={{ gap: 'var(--space-4)' }}>
        
        {/* Success / Error Messages */}
        {errorMsg && (
          <div className="oh-alert oh-alert--danger" role="alert" style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="oh-alert oh-alert--success" role="status" style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <CheckCircle2 size={18} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Viewport card */}
        {!scannedItem && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div
              id="qr-reader-viewport"
              style={{
                width: '100%',
                maxWidth: '280px',
                aspectRatio: '1',
                borderRadius: 'var(--radius-lg)',
                border: '2px dashed var(--color-border)',
                background: '#0a0f1d',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-muted)'
              }}
            >
              <div style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
                <Camera size={40} style={{ margin: '0 auto var(--space-2)', opacity: 0.5 }} />
                <p style={{ fontSize: '0.85rem' }}>Align Egypro QR label within frame</p>
              </div>
            </div>

            <form onSubmit={handleManualSearch} style={{ display: 'flex', gap: 'var(--space-2)', width: '100%' }}>
              <input
                type="text"
                className="oh-input"
                placeholder="Or enter serial, SKU, or QR code manually"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                disabled={loading}
                aria-label="Manual barcode fallback"
              />
              <Button type="submit" disabled={loading || !manualCode.trim()}>
                Find
              </Button>
            </form>
          </div>
        )}

        {/* Scanned Card Panel */}
        {scannedItem && (
          <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface-muted)' }}>
            <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <div>
                <span className="oh-badge" style={{ fontSize: '0.75rem', textTransform: 'uppercase', marginRight: 'var(--space-2)' }}>
                  {scannedItem.type}
                </span>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{scannedItem.name}</h3>
                <small className="oh-code" style={{ color: 'var(--color-navy-600)', fontWeight: 600 }}>{scannedItem.code}</small>
              </div>
              <Button variant="ghost" onClick={() => setScannedItem(null)} style={{ fontSize: '0.85rem' }}>
                Rescan
              </Button>
            </div>

            {/* Quick Action Forms based on scan type & status */}
            {scannedItem.type === 'equipment' && scannedItem.status === 'available' && (
              <form onSubmit={handleCheckoutSubmit} className="oh-form-stack">
                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Asset is <strong>Available</strong>. Choose an approved stock request to record handout.</p>
                <div>
                  <label className="oh-label">Fulfillment Warehouse</label>
                  <select
                    className="oh-select"
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    required
                  >
                    <option value="">Select source warehouse...</option>
                    {warehouses.map((wh) => (
                      <option key={wh.id} value={wh.id}>{wh.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="oh-label">Approved Stock Request</label>
                  <select
                    className="oh-select"
                    value={selectedRequestId}
                    onChange={(e) => setSelectedRequestId(e.target.value)}
                    required
                  >
                    <option value="">Select request...</option>
                    {approvedRequests
                      .filter((r) => r.status === 'approved')
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.project_name} (Requested by: {r.profiles_requested_by?.display_name || 'Staff'})
                        </option>
                      ))}
                  </select>
                </div>
                <Button type="submit" loading={loading} disabled={!selectedRequestId || !selectedWarehouseId}>
                  Confirm Handout / Checkout
                </Button>
              </form>
            )}

            {scannedItem.type === 'equipment' && scannedItem.status === 'assigned' && (
              <form onSubmit={handleReturnSubmit} className="oh-form-stack">
                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Asset is currently <strong>Assigned (Checked out)</strong>. Log its return to warehouse custody.</p>
                <div>
                  <label className="oh-label">Return Destination Warehouse</label>
                  <select
                    className="oh-select"
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    required
                  >
                    <option value="">Select warehouse...</option>
                    {warehouses.map((wh) => (
                      <option key={wh.id} value={wh.id}>{wh.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="oh-label">Asset Condition</label>
                  <select
                    className="oh-select"
                    value={returnCondition}
                    onChange={(e) => setReturnCondition(e.target.value as 'good' | 'damaged' | 'lost')}
                    required
                  >
                    <option value="good">Good / Functional</option>
                    <option value="damaged">Damaged (Needs repair)</option>
                    <option value="lost">Lost / Missing</option>
                  </select>
                </div>
                <div>
                  <label className="oh-label">Condition Notes</label>
                  <textarea
                    className="oh-input"
                    rows={3}
                    placeholder="Describe any wear, defect, or loss details..."
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                  />
                </div>
                <Button type="submit" loading={loading} disabled={!selectedWarehouseId}>
                  Record Return
                </Button>
              </form>
            )}

            {scannedItem.type === 'consumable' && (
              <div className="oh-form-stack" style={{ gap: 'var(--space-6)', marginTop: 'var(--space-4)' }}>
                {/* 1. Receive Stock Form */}
                <form onSubmit={handleReceiveSubmit} className="oh-form-stack" style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)' }}>
                  <h4 style={{ margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}><CheckCircle2 size={16} /> Record Goods Receipt (GRN)</h4>
                  <div>
                    <label className="oh-label">Warehouse</label>
                    <select
                      className="oh-select"
                      value={selectedWarehouseId}
                      onChange={(e) => setSelectedWarehouseId(e.target.value)}
                      required
                    >
                      <option value="">Select warehouse...</option>
                      {warehouses.map((wh) => (
                        <option key={wh.id} value={wh.id}>{wh.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                    <div>
                      <label className="oh-label">Quantity</label>
                      <input
                        type="number"
                        className="oh-input"
                        min={1}
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                        required
                      />
                    </div>
                    <div>
                      <label className="oh-label">Unit Price (UGX)</label>
                      <input
                        type="number"
                        className="oh-input"
                        min={0}
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(Number(e.target.value))}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="oh-label">Receipt Reference (GRN#)</label>
                    <input
                      type="text"
                      className="oh-input"
                      placeholder="e.g. GRN-2026-004"
                      value={receiptRef}
                      onChange={(e) => setReceiptRef(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" loading={loading} disabled={!selectedWarehouseId || !receiptRef || quantity <= 0}>
                    Post Goods Receipt
                  </Button>
                </form>

                {/* 2. Adjustment Form */}
                <form onSubmit={handleAdjustmentSubmit} className="oh-form-stack" style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)' }}>
                  <h4 style={{ margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}><AlertCircle size={16} /> Log Stock Adjustment</h4>
                  <div>
                    <label className="oh-label">Warehouse</label>
                    <select
                      className="oh-select"
                      value={selectedWarehouseId}
                      onChange={(e) => setSelectedWarehouseId(e.target.value)}
                      required
                    >
                      <option value="">Select warehouse...</option>
                      {warehouses.map((wh) => (
                        <option key={wh.id} value={wh.id}>{wh.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="oh-label">Quantity Offset (positive or negative)</label>
                    <input
                      type="number"
                      className="oh-input"
                      placeholder="e.g. -5 to reduce, 10 to increase"
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      required
                    />
                  </div>
                  <div>
                    <label className="oh-label">Mandatory Reason</label>
                    <input
                      type="text"
                      className="oh-input"
                      placeholder="e.g. Broken packaging, stocktake surplus"
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" loading={loading} disabled={!selectedWarehouseId || !actionNotes || quantity === 0}>
                    Submit Adjustment
                  </Button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
