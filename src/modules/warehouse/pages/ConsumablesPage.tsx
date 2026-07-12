import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { inventoryApi } from '../api/inventory'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Plus, AlertTriangle } from 'lucide-react'

export function ConsumablesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')

  // Quick Action Modal states
  const [adjusting, setAdjusting] = useState(false)
  const [receiving, setReceiving] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)
  const [receiptRef, setReceiptRef] = useState('')
  const [reason, setReason] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Fetch data
  const consumables = useQuery({ queryKey: ['consumables'], queryFn: inventoryApi.listConsumables })
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: inventoryApi.listWarehouses })
  const categories = useQuery({ queryKey: ['categories'], queryFn: inventoryApi.listCategories })
  const movements = useQuery({ queryKey: ['movements'], queryFn: inventoryApi.listMovements })

  const getBalance = (itemId: string) => {
    if (!movements.data) return 0
    return movements.data
      .filter((m) => m.consumable_item_id === itemId)
      .reduce((sum, m) => sum + m.quantity, 0)
  }

  // Mutations
  const receiveStock = useMutation({
    mutationFn: () => inventoryApi.receiveStock(warehouseId, receiptRef, [{
      consumable_item_id: selectedItemId,
      quantity,
      unit_price: unitPrice
    }]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['movements'] })
      setReceiving(false)
      resetForm()
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || 'Stock receipt failed.')
    }
  })

  const adjustStock = useMutation({
    mutationFn: () => inventoryApi.adjustStock(warehouseId, selectedItemId, null, quantity, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['movements'] })
      setAdjusting(false)
      resetForm()
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || 'Stock adjustment failed.')
    }
  })

  const resetForm = () => {
    setSelectedItemId('')
    setWarehouseId('')
    setQuantity(1)
    setUnitPrice(0)
    setReceiptRef('')
    setReason('')
    setErrorMsg('')
  }

  const filteredItems = useMemo(() => {
    let list = consumables.data || []
    const needle = search.trim().toLowerCase()
    
    if (needle) {
      list = list.filter(item => 
        item.name.toLowerCase().includes(needle) || 
        item.sku.toLowerCase().includes(needle)
      )
    }

    if (selectedCategory) {
      list = list.filter(item => item.category_id === selectedCategory)
    }

    return list
  }, [consumables.data, search, selectedCategory])

  return (
    <div className="oh-form-stack" style={{ gap: 'var(--space-6)' }}>
      {/* Top Header Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Consumable Materials</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>Manage bulk stock, SKUs, reorder points, and goods receipts.</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button onClick={() => setReceiving(true)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <Plus size={16} /> Post GRN (Receipt)
          </Button>
          <Button variant="secondary" onClick={() => setAdjusting(true)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <AlertTriangle size={16} /> Log Adjustment
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', background: 'var(--color-surface-muted)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1, minWidth: '240px' }}>
          <input
            type="text"
            className="oh-input"
            placeholder="Search by SKU or material name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%' }}
            aria-label="Search consumables"
          />
        </div>
        <select
          className="oh-select"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          style={{ width: '200px' }}
        >
          <option value="">All Categories</option>
          {(categories.data || []).map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Consumables Inventory Grid */}
      <div className="oh-table-wrap">
        <table className="oh-table">
          <thead>
            <tr>
              <th>Material Name</th>
              <th>SKU Code</th>
              <th>Category</th>
              <th>Reorder Min</th>
              <th>Current Balance</th>
              <th>Unit</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const bal = getBalance(item.id)
              const isLow = bal < item.reorder_level

              return (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td className="oh-code" style={{ color: 'var(--color-navy-700)' }}>{item.sku}</td>
                  <td>{item.item_categories?.name || 'Unassigned'}</td>
                  <td>{item.reorder_level}</td>
                  <td style={{ fontWeight: 800, color: isLow ? 'var(--color-red-600)' : 'inherit' }}>
                    {bal.toLocaleString()}
                  </td>
                  <td>{item.unit_of_measure}</td>
                  <td>
                    {isLow ? (
                      <span className="oh-badge oh-badge--warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                        <AlertTriangle size={12} /> Critical Stock
                      </span>
                    ) : (
                      <span className="oh-badge oh-badge--success">Optimal</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-4)' }}>
                  No materials found matching filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 1. Receive Stock GRN Modal */}
      <Modal open={receiving} title="Record Goods Receipt (GRN)" onClose={() => { setReceiving(false); resetForm() }}>
        <form onSubmit={(e) => { e.preventDefault(); receiveStock.mutate() }} className="oh-form-stack">
          {errorMsg && (
            <div className="oh-alert oh-alert--danger" role="alert">
              {errorMsg}
            </div>
          )}
          <div>
            <label className="oh-label">Consumable SKU / Material</label>
            <select
              className="oh-select"
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              required
            >
              <option value="">Select item...</option>
              {(consumables.data || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.sku})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="oh-label">Warehouse Destination</label>
            <select
              className="oh-select"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              required
            >
              <option value="">Select warehouse...</option>
              {(warehouses.data || []).map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
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
            <label className="oh-label">Receipt Reference (GRN# / Supplier Invoice#)</label>
            <input
              type="text"
              className="oh-input"
              placeholder="e.g. GRN-0051"
              value={receiptRef}
              onChange={(e) => setReceiptRef(e.target.value)}
              required
            />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
            <Button type="submit" loading={receiveStock.isPending} style={{ flex: 1 }}>Submit GRN</Button>
            <Button variant="secondary" onClick={() => { setReceiving(false); resetForm() }} style={{ flex: 1 }}>Cancel</Button>
          </div>
        </form>
      </Modal>

      {/* 2. Stock Adjustment Modal */}
      <Modal open={adjusting} title="Log Stock Adjustment" onClose={() => { setAdjusting(false); resetForm() }}>
        <form onSubmit={(e) => { e.preventDefault(); adjustStock.mutate() }} className="oh-form-stack">
          {errorMsg && (
            <div className="oh-alert oh-alert--danger" role="alert">
              {errorMsg}
            </div>
          )}
          <div>
            <label className="oh-label">Material SKU</label>
            <select
              className="oh-select"
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              required
            >
              <option value="">Select item...</option>
              {(consumables.data || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.sku})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="oh-label">Warehouse</label>
            <select
              className="oh-select"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              required
            >
              <option value="">Select warehouse...</option>
              {(warehouses.data || []).map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="oh-label">Quantity Offset (use negative value to write-off/reduce)</label>
            <input
              type="number"
              className="oh-input"
              placeholder="e.g. -10 for breakage, 5 for surplus"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="oh-label">Adjustment Reason (Mandatory)</label>
            <input
              type="text"
              className="oh-input"
              placeholder="e.g. Annual stocktake discrepancy"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
            <Button type="submit" loading={adjustStock.isPending} style={{ flex: 1 }}>Submit Adjustment</Button>
            <Button variant="secondary" onClick={() => { setAdjusting(false); resetForm() }} style={{ flex: 1 }}>Cancel</Button>
          </div>
        </form>
      </Modal>

    </div>
  )
}
