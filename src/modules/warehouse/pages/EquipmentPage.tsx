import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo, useEffect } from 'react'
import { inventoryApi, type EquipmentAsset } from '../api/inventory'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { ShieldAlert, QrCode, Printer } from 'lucide-react'

export function EquipmentPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')

  // QR Modal state
  const [selectedAsset, setSelectedAsset] = useState<EquipmentAsset | null>(null)
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [generatingQr, setGeneratingQr] = useState(false)

  // Edit notes state
  const [editingAsset, setEditingAsset] = useState<EquipmentAsset | null>(null)
  const [conditionNotes, setConditionNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  // Fetch data
  const equipment = useQuery({ queryKey: ['equipment'], queryFn: inventoryApi.listEquipment })
  const categories = useQuery({ queryKey: ['categories'], queryFn: inventoryApi.listCategories })
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: inventoryApi.listWarehouses })

  // Lazy load and generate QR code
  useEffect(() => {
    if (!selectedAsset) {
      return
    }

    import('qrcode')
      .then((QRCode) => {
        // Generate QR content following the exact EQPT:uuid prefix pattern
        const labelText = `EQPT:${selectedAsset.id}`
        return QRCode.toDataURL(labelText, {
          errorCorrectionLevel: 'H',
          margin: 2,
          width: 256
        })
      })
      .then((url) => {
        setQrCodeUrl(url)
      })
      .catch((err) => {
        console.error('Failed to generate QR:', err)
      })
      .finally(() => {
        setGeneratingQr(false)
      })
  }, [selectedAsset])

  const handleUpdateNotes = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingAsset) return
    setSavingNotes(true)
    try {
      // Run a standard stock adjustment of 0 to log the condition notes change
      const whId = editingAsset.current_warehouse_id || (warehouses.data?.[0]?.id || '')
      if (whId) {
        await inventoryApi.adjustStock(whId, null, editingAsset.id, 0, conditionNotes)
        await queryClient.invalidateQueries({ queryKey: ['equipment'] })
        setEditingAsset(null)
      }
    } catch (err) {
      console.error('Update failed:', err)
    } finally {
      setSavingNotes(false)
    }
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    printWindow.document.write(`
      <html>
        <head>
          <title>Print QR Label - ${selectedAsset?.serial_number}</title>
          <style>
            body {
              font-family: system-ui, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              text-align: center;
            }
            .label-card {
              border: 3px solid #000;
              border-radius: 12px;
              padding: 20px;
              max-width: 280px;
              background: #fff;
            }
            .title {
              font-weight: 800;
              font-size: 1.1rem;
              letter-spacing: 1px;
              margin-bottom: 5px;
            }
            .subtitle {
              font-size: 0.75rem;
              color: #555;
              text-transform: uppercase;
              margin-bottom: 15px;
            }
            img {
              width: 180px;
              height: 180px;
            }
            .details {
              font-family: monospace;
              font-size: 0.85rem;
              margin-top: 10px;
              word-break: break-all;
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="label-card">
            <div class="title">EGYPRO ONEHUB</div>
            <div class="subtitle">Property Identification Tag</div>
            <img src="${qrCodeUrl}" alt="QR code" />
            <div class="details">
              <strong>MODEL:</strong> ${selectedAsset?.model_name}<br/>
              <strong>SERIAL:</strong> ${selectedAsset?.serial_number}<br/>
              <strong>ASSET ID:</strong> ${selectedAsset?.id}
            </div>
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const filteredAssets = useMemo(() => {
    let list = equipment.data || []
    const needle = search.trim().toLowerCase()

    if (needle) {
      list = list.filter(item => 
        item.model_name.toLowerCase().includes(needle) || 
        item.serial_number.toLowerCase().includes(needle)
      )
    }

    if (selectedStatus) {
      list = list.filter(item => item.status === selectedStatus)
    }

    if (selectedCategory) {
      list = list.filter(item => item.category_id === selectedCategory)
    }

    return list
  }, [equipment.data, search, selectedStatus, selectedCategory])

  return (
    <div className="oh-form-stack" style={{ gap: 'var(--space-6)' }}>
      {/* Top Header Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Equipment & Assets</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>Asset directory, tracking status, sensitivity levels, and printing QR labels.</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', background: 'var(--color-surface-muted)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1, minWidth: '240px' }}>
          <input
            type="text"
            className="oh-input"
            placeholder="Search by serial number or model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%' }}
            aria-label="Search equipment"
          />
        </div>
        <select
          className="oh-select"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          style={{ width: '160px' }}
        >
          <option value="">All Statuses</option>
          <option value="available">Available</option>
          <option value="assigned">Assigned</option>
          <option value="maintenance">Maintenance</option>
          <option value="damaged">Damaged</option>
          <option value="lost">Lost</option>
        </select>
        <select
          className="oh-select"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          style={{ width: '180px' }}
        >
          <option value="">All Categories</option>
          {(categories.data || []).map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Equipment Table Grid */}
      <div className="oh-table-wrap">
        <table className="oh-table">
          <thead>
            <tr>
              <th>Model / Asset Name</th>
              <th>Serial Number</th>
              <th>Category</th>
              <th>Sensitivity</th>
              <th>Condition Notes</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAssets.map((asset) => (
              <tr key={asset.id}>
                <td><strong>{asset.model_name}</strong></td>
                <td className="oh-code" style={{ color: 'var(--color-navy-700)' }}>{asset.serial_number}</td>
                <td>{asset.item_categories?.name || 'Unassigned'}</td>
                <td>
                  {asset.is_sensitive ? (
                    <span className="oh-badge oh-badge--warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                      <ShieldAlert size={12} /> Sensitive
                    </span>
                  ) : (
                    <span className="oh-badge" style={{ color: 'var(--color-text-muted)' }}>Standard</span>
                  )}
                </td>
                <td style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {asset.condition_notes || 'No active wear logged.'}
                </td>
                <td>
                  <span className={`oh-badge ${
                    asset.status === 'available' ? 'oh-badge--success' : 
                    asset.status === 'assigned' ? 'oh-badge--info' :
                    'oh-badge--danger'
                  }`} style={{ textTransform: 'capitalize' }}>
                    {asset.status}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                    <Button
                      variant="ghost"
                      onClick={() => { setSelectedAsset(asset); setGeneratingQr(true); }}
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '2px' }}
                      title="View QR Label"
                    >
                      <QrCode size={13} /> Label
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => { setEditingAsset(asset); setConditionNotes(asset.condition_notes || '') }}
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                    >
                      Notes
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredAssets.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-4)' }}>
                  No assets found matching filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 1. QR code Label Modal */}
      <Modal open={!!selectedAsset} title="Equipment QR Code Label" onClose={() => { setSelectedAsset(null); setQrCodeUrl(''); }}>
        {selectedAsset && (
          <div className="oh-form-stack" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div
              className="label-card"
              style={{
                border: '3px solid var(--color-navy-800)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                background: '#fff',
                color: '#000',
                display: 'inline-block',
                margin: 'auto'
              }}
            >
              <div style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '1px' }}>EGYPRO ONEHUB</div>
              <div style={{ fontSize: '0.7rem', color: '#555', textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>
                Property Identification Tag
              </div>
              {generatingQr ? (
                <div style={{ width: '180px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  Generating QR...
                </div>
              ) : (
                <img src={qrCodeUrl} alt="Asset QR Code" style={{ width: '180px', height: '180px', margin: 'auto' }} />
              )}
              <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', marginTop: 'var(--space-2)' }}>
                <strong>MODEL:</strong> {selectedAsset.model_name}<br/>
                <strong>SERIAL:</strong> {selectedAsset.serial_number}<br/>
                <strong>ASSET ID:</strong> <span style={{ fontSize: '0.65rem' }}>{selectedAsset.id}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)', width: '100%', marginTop: 'var(--space-3)' }}>
              <Button onClick={handlePrint} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <Printer size={16} /> Print Label
              </Button>
              <Button variant="secondary" onClick={() => { setSelectedAsset(null); setQrCodeUrl(''); }} style={{ flex: 1 }}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 2. Edit Condition Notes Modal */}
      <Modal open={!!editingAsset} title="Edit Condition / Maintenance Notes" onClose={() => setEditingAsset(null)}>
        {editingAsset && (
          <form onSubmit={handleUpdateNotes} className="oh-form-stack">
            <p style={{ fontSize: '0.9rem' }}>Update wear description or service status log for <strong>{editingAsset.model_name} ({editingAsset.serial_number})</strong>.</p>
            <div>
              <label className="oh-label">Condition Notes</label>
              <textarea
                className="oh-input"
                rows={4}
                placeholder="e.g. Scratched lens, missing strap, battery checked OK..."
                value={conditionNotes}
                onChange={(e) => setConditionNotes(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              <Button type="submit" loading={savingNotes} style={{ flex: 1 }}>Save Notes</Button>
              <Button variant="secondary" onClick={() => setEditingAsset(null)} style={{ flex: 1 }}>Cancel</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
