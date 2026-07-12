import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { inventoryApi } from '../api/inventory'
import { Button } from '../../../components/ui/Button'
import { Download } from 'lucide-react'

export function HistoryPage() {
  const [search, setSearch] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')

  // Fetch movements
  const movements = useQuery({ queryKey: ['movements'], queryFn: inventoryApi.listMovements })
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: inventoryApi.listWarehouses })

  // Filtering
  const filtered = useMemo(() => {
    let list = movements.data || []
    const needle = search.trim().toLowerCase()

    if (needle) {
      list = list.filter((m) => 
        m.reference_id.toLowerCase().includes(needle) ||
        m.consumable_items?.name.toLowerCase().includes(needle) ||
        m.consumable_items?.sku.toLowerCase().includes(needle) ||
        m.equipment_assets?.model_name.toLowerCase().includes(needle) ||
        m.equipment_assets?.serial_number.toLowerCase().includes(needle) ||
        m.profiles_performed_by?.display_name?.toLowerCase().includes(needle)
      )
    }

    if (selectedType) {
      list = list.filter((m) => m.movement_type === selectedType)
    }

    if (selectedWarehouseId) {
      list = list.filter((m) => m.warehouse_id === selectedWarehouseId)
    }

    return list
  }, [movements.data, search, selectedType, selectedWarehouseId])

  const handleExport = async () => {
    const XLSX = await import('@e965/xlsx')
    const rows = filtered.map((m) => ({
      'Date Time': new Date(m.created_at).toLocaleString(),
      'Movement Type': m.movement_type,
      'Warehouse': m.warehouses?.name || '',
      'Item Name': m.consumable_items?.name || m.equipment_assets?.model_name || 'Asset',
      'SKU / Serial': m.consumable_items?.sku || m.equipment_assets?.serial_number || '',
      'Quantity Change': m.quantity,
      'Reference ID': m.reference_id,
      'Performed By': m.profiles_performed_by?.display_name || ''
    }))

    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(workbook, sheet, 'Ledger Movements')
    XLSX.writeFile(workbook, `Egypro_Inventory_Ledger_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="oh-form-stack" style={{ gap: 'var(--space-6)' }}>
      {/* Top Header Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Inventory Ledger History</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>Complete audit trail of stock receipts, handouts, adjustments, and returns.</p>
        </div>
        <Button onClick={handleExport} disabled={filtered.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <Download size={16} /> Export to Excel
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', background: 'var(--color-surface-muted)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1, minWidth: '240px' }}>
          <input
            type="text"
            className="oh-input"
            placeholder="Search by reference, SKU, or user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%' }}
            aria-label="Search history"
          />
        </div>
        <select
          className="oh-select"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          style={{ width: '170px' }}
        >
          <option value="">All Movement Types</option>
          <option value="receipt">Receipt (GRN)</option>
          <option value="issue">Issue (Checkout)</option>
          <option value="return">Return</option>
          <option value="adjustment_add">Adjustment Add</option>
          <option value="adjustment_remove">Adjustment Remove</option>
        </select>
        <select
          className="oh-select"
          value={selectedWarehouseId}
          onChange={(e) => setSelectedWarehouseId(e.target.value)}
          style={{ width: '180px' }}
        >
          <option value="">All Warehouses</option>
          {(warehouses.data || []).map((wh) => (
            <option key={wh.id} value={wh.id}>{wh.name}</option>
          ))}
        </select>
      </div>

      {/* Ledger Table */}
      <div className="oh-table-wrap">
        <table className="oh-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Type</th>
              <th>Warehouse</th>
              <th>Item / Material</th>
              <th>SKU / Serial</th>
              <th>Quantity Change</th>
              <th>Reference ID</th>
              <th>Performed By</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id}>
                <td style={{ fontSize: '0.85rem' }}>{new Date(m.created_at).toLocaleString()}</td>
                <td>
                  <span className={`oh-badge ${
                    m.movement_type === 'receipt' || m.movement_type === 'adjustment_add' ? 'oh-badge--success' : 
                    m.movement_type === 'return' ? 'oh-badge--info' :
                    'oh-badge--warning'
                  }`} style={{ textTransform: 'capitalize', fontSize: '0.75rem' }}>
                    {m.movement_type.replaceAll('_', ' ')}
                  </span>
                </td>
                <td>{m.warehouses?.name || '—'}</td>
                <td>{m.consumable_items?.name || m.equipment_assets?.model_name || 'Asset'}</td>
                <td className="oh-code" style={{ fontSize: '0.85rem', color: 'var(--color-navy-700)' }}>
                  {m.consumable_items?.sku || m.equipment_assets?.serial_number || '—'}
                </td>
                <td style={{ fontWeight: 800, color: m.quantity < 0 ? 'var(--color-red-600)' : 'var(--color-green-700)' }}>
                  {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                </td>
                <td style={{ fontSize: '0.8rem', color: 'var(--color-navy-600)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.reference_id}
                </td>
                <td>{m.profiles_performed_by?.display_name || 'Staff'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-4)' }}>
                  No ledger history entries match filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
