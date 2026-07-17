import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { AlertTriangle, PackagePlus, Plus } from 'lucide-react'
import { inventoryApi, type ConsumableMasterInput, type ReceiptEvidenceInput } from '../api/inventory'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { CategoryChoice } from '../components/CategoryChoice'

const today = new Date().toISOString().slice(0, 10)

export function ConsumablesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [receiveMode, setReceiveMode] = useState<'new' | 'existing' | null>(null)
  const [masterOpen, setMasterOpen] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryDescription, setNewCategoryDescription] = useState('')
  const [itemName, setItemName] = useState('')
  const [sku, setSku] = useState('')
  const [unitOfMeasure, setUnitOfMeasure] = useState('unit')
  const [reorderLevel, setReorderLevel] = useState(0)
  const [supplierName, setSupplierName] = useState('')
  const [grnNumber, setGrnNumber] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [receivedDate, setReceivedDate] = useState(today)
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)
  const [reason, setReason] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const consumables = useQuery({ queryKey: ['consumables'], queryFn: inventoryApi.listConsumables })
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: inventoryApi.listWarehouses })
  const categories = useQuery({ queryKey: ['categories'], queryFn: inventoryApi.listCategories })
  const movements = useQuery({ queryKey: ['movements'], queryFn: inventoryApi.listMovements })

  const headquartersWarehouse = (warehouses.data || []).find((warehouse) => warehouse.code === 'HQ-01') ?? warehouses.data?.[0]
  const warehouseId = headquartersWarehouse?.id ?? ''
  const master: ConsumableMasterInput = { categoryId, newCategoryName, newCategoryDescription, name: itemName, sku, unitOfMeasure, reorderLevel }
  const receipt: ReceiptEvidenceInput = { warehouseId, supplierName, grnNumber, invoiceNumber, receivedDate, purchaseValue: unitPrice }
  const reset = () => {
    setSelectedItemId(''); setCategoryId(''); setNewCategoryName(''); setNewCategoryDescription(''); setItemName(''); setSku(''); setUnitOfMeasure('unit'); setReorderLevel(0)
    setSupplierName(''); setGrnNumber(''); setInvoiceNumber(''); setReceivedDate(today)
    setQuantity(1); setUnitPrice(0); setReason(''); setErrorMsg('')
  }
  const refreshStock = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['consumables'] }),
      queryClient.invalidateQueries({ queryKey: ['movements'] }),
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
      queryClient.invalidateQueries({ queryKey: ['inventory-overview'] })
    ])
  }
  const receive = useMutation({
    mutationFn: () => inventoryApi.receiveConsumable(receiveMode === 'existing' ? selectedItemId : null, receiveMode === 'new' ? master : null, receipt, quantity),
    onSuccess: async () => { await refreshStock(); setReceiveMode(null); reset() },
    onError: (error: Error) => setErrorMsg(error.message || 'Goods receipt could not be recorded.')
  })
  const createMaster = useMutation({
    mutationFn: () => inventoryApi.createConsumableItem(master),
    onSuccess: async () => { await refreshStock(); setMasterOpen(false); reset() },
    onError: (error: Error) => setErrorMsg(error.message || 'Item master could not be created.')
  })
  const adjust = useMutation({
    mutationFn: () => inventoryApi.adjustStock(warehouseId, selectedItemId, null, quantity, reason),
    onSuccess: async () => { await refreshStock(); setAdjusting(false); reset() },
    onError: (error: Error) => setErrorMsg(error.message || 'Stock adjustment failed.')
  })
  const balance = (itemId: string) => (movements.data || []).filter((movement) => movement.consumable_item_id === itemId).reduce((sum, movement) => sum + movement.quantity, 0)
  const filteredItems = useMemo(() => (consumables.data || []).filter((item) => {
    const needle = search.trim().toLowerCase()
    return (!needle || item.name.toLowerCase().includes(needle) || item.sku.toLowerCase().includes(needle)) && (!selectedCategory || item.category_id === selectedCategory)
  }), [consumables.data, search, selectedCategory])

  const masterFields = <>
    <div className="oh-form-grid">
      <div className="oh-field"><label className="oh-field__label">Item name</label><input className="oh-input" value={itemName} onChange={(event) => setItemName(event.target.value)} required /></div>
      <div className="oh-field"><label className="oh-field__label">SKU code</label><input className="oh-input" value={sku} onChange={(event) => setSku(event.target.value.toUpperCase())} placeholder="CABLE-001" required /></div>
      <CategoryChoice categories={categories.data || []} categoryId={categoryId} newCategoryName={newCategoryName} newCategoryDescription={newCategoryDescription} onCategoryIdChange={setCategoryId} onNewCategoryNameChange={setNewCategoryName} onNewCategoryDescriptionChange={setNewCategoryDescription} />
      <div className="oh-field"><label className="oh-field__label">Unit of measure</label><input className="oh-input" value={unitOfMeasure} onChange={(event) => setUnitOfMeasure(event.target.value)} placeholder="metre, bag, piece" required /></div>
      <div className="oh-field"><label className="oh-field__label">Reorder minimum</label><input className="oh-input" type="number" min={0} value={reorderLevel} onChange={(event) => setReorderLevel(Number(event.target.value))} required /></div>
    </div>
  </>
  const receiptFields = <>
    <div className="oh-form-section-divider"><strong>Supplier & receipt details</strong><span>These details form the auditable goods receipt.</span></div>
    <div className="oh-form-grid">
      <div className="oh-field"><span className="oh-field__label">Inventory location</span><div className="oh-readonly-field">{headquartersWarehouse?.name ?? 'Loading HQ warehouse…'}</div></div>
      <div className="oh-field"><label className="oh-field__label">Supplier name</label><input className="oh-input" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} required /></div>
      <div className="oh-field"><label className="oh-field__label">GRN number</label><input className="oh-input" value={grnNumber} onChange={(event) => setGrnNumber(event.target.value)} required /></div>
      <div className="oh-field"><label className="oh-field__label">Supplier invoice number</label><input className="oh-input" value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} required /></div>
      <div className="oh-field"><label className="oh-field__label">Received date</label><input className="oh-input" type="date" max={today} value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} required /></div>
      <div className="oh-field"><label className="oh-field__label">Quantity received</label><input className="oh-input" type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} required /></div>
      <div className="oh-field"><label className="oh-field__label">Purchase price per unit (UGX)</label><input className="oh-input" type="number" min={0} value={unitPrice} onChange={(event) => setUnitPrice(Number(event.target.value))} required /></div>
    </div>
  </>

  return <div className="oh-form-stack" style={{ gap: 'var(--space-6)' }}>
    <div className="oh-page-action-header"><div><h2>Consumable materials</h2><p>Create the item record first, or receive a new delivery in one guided step.</p></div><div className="oh-action-cluster">
      <Button onClick={() => { reset(); setReceiveMode('new') }}><PackagePlus size={16} /> Receive new item</Button>
      <Button variant="secondary" onClick={() => { reset(); setReceiveMode('existing') }}><Plus size={16} /> Receive existing item</Button>
      <Button variant="secondary" onClick={() => { reset(); setMasterOpen(true) }}>Add item master</Button>
      <Button variant="secondary" onClick={() => { reset(); setAdjusting(true) }}><AlertTriangle size={16} /> Adjustment</Button>
    </div></div>
    <div className="oh-inventory-filter"><input className="oh-input" placeholder="Search by SKU or material name…" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search consumables" /><select className="oh-select" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}><option value="">All categories</option>{(categories.data || []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
    <div className="oh-table-wrap"><table className="oh-table"><thead><tr><th>Material</th><th>SKU</th><th>Category</th><th>Reorder min</th><th>Current balance</th><th>Unit</th><th>Status</th></tr></thead><tbody>
      {filteredItems.map((item) => { const current = balance(item.id); const low = current < item.reorder_level; return <tr key={item.id}><td><strong>{item.name}</strong></td><td className="oh-code">{item.sku}</td><td>{item.item_categories?.name || 'Unassigned'}</td><td>{item.reorder_level}</td><td><strong>{current.toLocaleString()}</strong></td><td>{item.unit_of_measure}</td><td><span className={`oh-badge ${low ? 'oh-badge--warning' : 'oh-badge--success'}`}>{low ? 'Low stock' : 'Available'}</span></td></tr> })}
      {!filteredItems.length ? <tr><td colSpan={7} className="oh-table-empty">No consumable items yet. Use “Receive new item” for the first delivery.</td></tr> : null}
    </tbody></table></div>

    <Modal open={receiveMode !== null} title={receiveMode === 'new' ? 'Receive a new item' : 'Receive an existing item'} onClose={() => { setReceiveMode(null); reset() }}><form className="oh-form-stack" onSubmit={(event) => { event.preventDefault(); receive.mutate() }}>
      {errorMsg ? <div className="oh-alert oh-alert--danger" role="alert">{errorMsg}</div> : null}
      {receiveMode === 'new' ? masterFields : <div className="oh-field"><label className="oh-field__label">Existing item</label><select className="oh-select" value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)} required><option value="">Select item…</option>{(consumables.data || []).map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select></div>}
      {receiptFields}<div className="oh-modal-actions"><Button variant="secondary" type="button" onClick={() => { setReceiveMode(null); reset() }}>Cancel</Button><Button type="submit" loading={receive.isPending} disabled={!warehouseId}>Record receipt</Button></div>
    </form></Modal>
    <Modal open={masterOpen} title="Add consumable item master" onClose={() => { setMasterOpen(false); reset() }}><form className="oh-form-stack" onSubmit={(event) => { event.preventDefault(); createMaster.mutate() }}>{errorMsg ? <div className="oh-alert oh-alert--danger" role="alert">{errorMsg}</div> : null}{masterFields}<div className="oh-modal-actions"><Button variant="secondary" type="button" onClick={() => { setMasterOpen(false); reset() }}>Cancel</Button><Button type="submit" loading={createMaster.isPending}>Create item</Button></div></form></Modal>
    <Modal open={adjusting} title="Log stock adjustment" onClose={() => { setAdjusting(false); reset() }}><form className="oh-form-stack" onSubmit={(event) => { event.preventDefault(); adjust.mutate() }}>{errorMsg ? <div className="oh-alert oh-alert--danger" role="alert">{errorMsg}</div> : null}<div className="oh-field"><label className="oh-field__label">Item</label><select className="oh-select" value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)} required><option value="">Select item…</option>{(consumables.data || []).map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select></div><div className="oh-field"><span className="oh-field__label">Inventory location</span><div className="oh-readonly-field">{headquartersWarehouse?.name ?? 'Loading HQ warehouse…'}</div></div><div className="oh-field"><label className="oh-field__label">Quantity offset</label><input className="oh-input" type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} required /></div><div className="oh-field"><label className="oh-field__label">Reason</label><input className="oh-input" value={reason} onChange={(event) => setReason(event.target.value)} required /></div><div className="oh-modal-actions"><Button variant="secondary" type="button" onClick={() => { setAdjusting(false); reset() }}>Cancel</Button><Button type="submit" loading={adjust.isPending} disabled={!warehouseId}>Save adjustment</Button></div></form></Modal>
  </div>
}
