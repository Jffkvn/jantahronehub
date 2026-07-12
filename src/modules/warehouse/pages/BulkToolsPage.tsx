import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { inventoryApi, type BulkCategory, type BulkConsumable, type BulkEquipment, type BulkGeneralRow } from '../api/inventory'
import { Button } from '../../../components/ui/Button'
import { ArrowLeft, Download, Upload, AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react'

interface ImportError {
  rowNumber: number
  field: string
  message: string
}

export function BulkToolsPage() {
  const queryClient = useQueryClient()
  const [activeTemplate, setActiveTemplate] = useState<'item_master' | 'goods_received' | 'opening_stock' | 'stock_adjustment'>('item_master')
  const [file, setFile] = useState<File | null>(null)
  
  // Validation/Preview states
  const [validating, setValidating] = useState(false)
  const [errors, setErrors] = useState<ImportError[]>([])
  const [previewData, setPreviewData] = useState<{
    categories: BulkCategory[]
    consumables: BulkConsumable[]
    equipment: BulkEquipment[]
    generalRows: BulkGeneralRow[]
  } | null>(null)

  const [committing, setCommitting] = useState(false)
  const [completedReport, setCompletedReport] = useState<{
    successCount: number
    message: string
  } | null>(null)

  // Download excel templates helper
  const handleDownloadTemplate = async (type: typeof activeTemplate) => {
    const XLSX = await import('@e965/xlsx')
    
    const config = {
      item_master: {
        sheetName: 'Item Master Upload',
        headers: ['Type', 'Name', 'Description', 'SKU', 'Unit of Measure', 'Reorder Level', 'Serial Number', 'Model Name', 'Is Sensitive', 'Current Warehouse Name', 'Condition Notes'],
        sampleRow: ['consumable', 'Cement Bag 50kg', 'Building cement supply', 'CMT-BG-50', 'bag', '20', '', '', 'FALSE', '', '']
      },
      goods_received: {
        sheetName: 'Goods Received Upload',
        headers: ['Receipt Reference', 'Warehouse Name', 'SKU or Serial', 'Quantity', 'Unit Price'],
        sampleRow: ['GRN-2026-001', 'Kampala Main Depot', 'CMT-BG-50', '100', '35000']
      },
      opening_stock: {
        sheetName: 'Opening Stock Upload',
        headers: ['Warehouse Name', 'SKU', 'Quantity'],
        sampleRow: ['Kampala Main Depot', 'CMT-BG-50', '50']
      },
      stock_adjustment: {
        sheetName: 'Stock Adjustment Upload',
        headers: ['Warehouse Name', 'SKU or Serial', 'Quantity', 'Reason'],
        sampleRow: ['Kampala Main Depot', 'CMT-BG-50', '-2', 'Torn packaging write-off']
      }
    }[type]

    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.json_to_sheet([], { header: config.headers })
    XLSX.utils.sheet_add_aoa(sheet, [config.sampleRow], { origin: 'A2' })
    XLSX.utils.book_append_sheet(workbook, sheet, config.sheetName)
    XLSX.writeFile(workbook, `Egypro_Inventory_Template_${type}.xlsx`)
  }

  // Parse and validate Excel file
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setErrors([])
    setPreviewData(null)
    setCompletedReport(null)
    setValidating(true)

    try {
      const XLSX = await import('@e965/xlsx')
      const buffer = await selectedFile.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      
      let expectedSheet = ''
      if (activeTemplate === 'item_master') expectedSheet = 'Item Master Upload'
      else if (activeTemplate === 'goods_received') expectedSheet = 'Goods Received Upload'
      else if (activeTemplate === 'opening_stock') expectedSheet = 'Opening Stock Upload'
      else expectedSheet = 'Stock Adjustment Upload'

      const sheet = workbook.Sheets[expectedSheet]
      if (!sheet) {
        throw new Error(`The workbook must contain a sheet named "${expectedSheet}".`)
      }

      const records = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' })
      if (records.length === 0) {
        throw new Error('Workbook contains no records/rows to process.')
      }

      // Perform validation based on template type
      const rowErrors: ImportError[] = []
      const categories: BulkCategory[] = []
      const consumables: BulkConsumable[] = []
      const equipment: BulkEquipment[] = []
      const generalRows: BulkGeneralRow[] = []

      // Keep track of duplicate SKU/Serial in spreadsheet
      const seenSkus = new Set<string>()
      const seenSerials = new Set<string>()

      records.forEach((row, idx) => {
        const rowNum = idx + 2 // A1 is header, A2 is row 2
        
        if (activeTemplate === 'item_master') {
          const type = String(row.Type || '').trim().toLowerCase()
          if (!type || !['category', 'consumable', 'equipment'].includes(type)) {
            rowErrors.push({ rowNumber: rowNum, field: 'Type', message: 'Type must be "category", "consumable", or "equipment".' })
          }

          if (type === 'category') {
            const name = String(row.Name || '').trim()
            if (!name) rowErrors.push({ rowNumber: rowNum, field: 'Name', message: 'Category Name is required.' })
            categories.push({ name, description: row.Description })
          } else if (type === 'consumable') {
            const name = String(row.Name || '').trim()
            const sku = String(row.SKU || '').trim()
            const catName = String(row.Description || '').trim() // Category name put in Description column for simplicity or lookups
            
            if (!name) rowErrors.push({ rowNumber: rowNum, field: 'Name', message: 'Consumable Name is required.' })
            if (!sku) {
              rowErrors.push({ rowNumber: rowNum, field: 'SKU', message: 'SKU is required.' })
            } else {
              if (seenSkus.has(sku.toLowerCase())) {
                rowErrors.push({ rowNumber: rowNum, field: 'SKU', message: `Duplicate SKU "${sku}" found in spreadsheet.` })
              }
              seenSkus.add(sku.toLowerCase())
            }

            consumables.push({
              name,
              sku,
              category_name: catName || 'General',
              unit_of_measure: row['Unit of Measure'] || 'pcs',
              reorder_level: Number(row['Reorder Level'] || 0)
            })
          } else if (type === 'equipment') {
            const model = String(row['Model Name'] || '').trim()
            const serial = String(row['Serial Number'] || '').trim()
            const catName = String(row.Description || '').trim() // Category name put in Description column
            
            if (!model) rowErrors.push({ rowNumber: rowNum, field: 'Model Name', message: 'Model Name is required.' })
            if (!serial) {
              rowErrors.push({ rowNumber: rowNum, field: 'Serial Number', message: 'Serial Number is required.' })
            } else {
              if (seenSerials.has(serial.toLowerCase())) {
                rowErrors.push({ rowNumber: rowNum, field: 'Serial Number', message: `Duplicate Serial Number "${serial}" in spreadsheet.` })
              }
              seenSerials.add(serial.toLowerCase())
            }

            equipment.push({
              model_name: model,
              serial_number: serial,
              category_name: catName || 'General',
              current_warehouse_name: row['Current Warehouse Name'],
              is_sensitive: String(row['Is Sensitive']).trim().toLowerCase() === 'true',
              condition_notes: row['Condition Notes']
            })
          }
        } else if (activeTemplate === 'goods_received') {
          const ref = String(row['Receipt Reference'] || '').trim()
          const wh = String(row['Warehouse Name'] || '').trim()
          const identifier = String(row['SKU or Serial'] || '').trim()
          const qty = Number(row.Quantity)
          const price = Number(row['Unit Price'] || 0)

          if (!ref) rowErrors.push({ rowNumber: rowNum, field: 'Receipt Reference', message: 'Receipt Reference is required.' })
          if (!wh) rowErrors.push({ rowNumber: rowNum, field: 'Warehouse Name', message: 'Warehouse Name is required.' })
          if (!identifier) rowErrors.push({ rowNumber: rowNum, field: 'SKU or Serial', message: 'Identifier SKU or Serial is required.' })
          if (isNaN(qty) || qty <= 0) rowErrors.push({ rowNumber: rowNum, field: 'Quantity', message: 'Quantity must be a positive integer.' })

          generalRows.push({
            receipt_reference: ref,
            warehouse_name: wh,
            sku_or_serial: identifier,
            quantity: qty,
            unit_price: price
          })
        } else if (activeTemplate === 'opening_stock') {
          const wh = String(row['Warehouse Name'] || '').trim()
          const sku = String(row.SKU || '').trim()
          const qty = Number(row.Quantity)

          if (!wh) rowErrors.push({ rowNumber: rowNum, field: 'Warehouse Name', message: 'Warehouse Name is required.' })
          if (!sku) rowErrors.push({ rowNumber: rowNum, field: 'SKU', message: 'SKU code is required.' })
          if (isNaN(qty) || qty <= 0) rowErrors.push({ rowNumber: rowNum, field: 'Quantity', message: 'Quantity must be a positive integer.' })

          generalRows.push({
            warehouse_name: wh,
            sku,
            quantity: qty
          })
        } else if (activeTemplate === 'stock_adjustment') {
          const wh = String(row['Warehouse Name'] || '').trim()
          const identifier = String(row['SKU or Serial'] || '').trim()
          const qty = Number(row.Quantity)
          const reason = String(row.Reason || '').trim()

          if (!wh) rowErrors.push({ rowNumber: rowNum, field: 'Warehouse Name', message: 'Warehouse Name is required.' })
          if (!identifier) rowErrors.push({ rowNumber: rowNum, field: 'SKU or Serial', message: 'SKU or Serial is required.' })
          if (isNaN(qty) || qty === 0) rowErrors.push({ rowNumber: rowNum, field: 'Quantity', message: 'Quantity offset cannot be zero.' })
          if (!reason) rowErrors.push({ rowNumber: rowNum, field: 'Reason', message: 'Adjustment reason is required.' })

          generalRows.push({
            warehouse_name: wh,
            sku_or_serial: identifier,
            quantity: qty,
            reason
          })
        }
      })

      setErrors(rowErrors)
      setPreviewData({ categories, consumables, equipment, generalRows })
    } catch (err) {
      setErrors([{ rowNumber: 0, field: 'file', message: err instanceof Error ? err.message : 'Failed to read Excel workbook.' }])
    } finally {
      setValidating(false)
    }
  }

  // Confirm and Commit Import
  const handleConfirmImport = async () => {
    if (!previewData || errors.length > 0) return
    setCommitting(true)
    setErrors([])

    try {
      if (activeTemplate === 'item_master') {
        await inventoryApi.bulkImportItemMaster(previewData.categories, previewData.consumables, previewData.equipment)
        setCompletedReport({
          successCount: previewData.categories.length + previewData.consumables.length + previewData.equipment.length,
          message: `Successfully imported ${previewData.categories.length} Categories, ${previewData.consumables.length} Consumables, and ${previewData.equipment.length} Equipment Assets.`
        })
      } else if (activeTemplate === 'goods_received') {
        await inventoryApi.bulkReceiveStock(previewData.generalRows)
        setCompletedReport({
          successCount: previewData.generalRows.length,
          message: `Successfully posted ${previewData.generalRows.length} goods receipt rows grouped by Reference.`
        })
      } else if (activeTemplate === 'opening_stock') {
        await inventoryApi.bulkOpeningStock(previewData.generalRows)
        setCompletedReport({
          successCount: previewData.generalRows.length,
          message: `Successfully loaded opening balance stocks for ${previewData.generalRows.length} rows.`
        })
      } else if (activeTemplate === 'stock_adjustment') {
        await inventoryApi.bulkAdjustStock(previewData.generalRows)
        setCompletedReport({
          successCount: previewData.generalRows.length,
          message: `Successfully recorded ${previewData.generalRows.length} manual ledger stock adjustments.`
        })
      }

      // Invalidate query cash
      await queryClient.invalidateQueries({ queryKey: ['consumables'] })
      await queryClient.invalidateQueries({ queryKey: ['equipment'] })
      await queryClient.invalidateQueries({ queryKey: ['movements'] })

      setFile(null)
      setPreviewData(null)
    } catch (err) {
      setErrors([{ rowNumber: 0, field: 'import', message: err instanceof Error ? err.message : 'Database commit transaction failed.' }])
    } finally {
      setCommitting(false)
    }
  }

  return (
    <section className="oh-workspace-page">
      <Link className="oh-back-link" to="/inventory/overview" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <ArrowLeft size={16} /> Back to overview
      </Link>
      
      <header className="oh-page-header" style={{ marginBottom: 'var(--space-6)' }}>
        <div>
          <p>Bulk Tools</p>
          <h1>Inventory spreadsheet import</h1>
          <span>Upload, validate, and preview spreadsheet changes before saving.</span>
        </div>
      </header>

      {/* Selector of Import Type */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
        {(['item_master', 'goods_received', 'opening_stock', 'stock_adjustment'] as const).map((type) => (
          <button
            key={type}
            onClick={() => {
              setActiveTemplate(type)
              setFile(null)
              setErrors([])
              setPreviewData(null)
              setCompletedReport(null)
            }}
            className="oh-portal-tab"
            style={{
              background: activeTemplate === type ? 'var(--color-primary-50)' : 'var(--color-surface)',
              color: activeTemplate === type ? 'var(--color-primary-700)' : 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
              cursor: 'pointer'
            }}
          >
            {type.replaceAll('_', ' ').toUpperCase()}
          </button>
        ))}
      </div>

      {/* Zone Zone */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', alignItems: 'start' }}>
        
        {/* Upload Zone */}
        <div className="oh-form-stack" style={{ gap: 'var(--space-4)' }}>
          <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 var(--space-3)' }}>1. Download Spreadsheet Template</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
              Download the matching Excel schema. Populate your records and upload below. Includes correct header and sample row.
            </p>
            <Button onClick={() => handleDownloadTemplate(activeTemplate)} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Download size={16} /> Download Template
            </Button>
          </div>

          <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 var(--space-3)' }}>2. Upload Populated Spreadsheet</h3>
            <label className="oh-upload-zone" style={{ border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
              <Upload size={32} style={{ color: 'var(--color-primary-600)' }} />
              <strong>Select populated workbook</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>.xlsx only, maximum 5 MB</span>
              <input
                type="file"
                accept=".xlsx"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                aria-label="Spreadsheet upload file input"
              />
            </label>
            {file && (
              <div style={{ fontSize: '0.85rem', color: 'var(--color-primary-700)', fontWeight: 650, marginTop: 'var(--space-2)', textAlign: 'center' }}>
                Selected file: {file.name}
              </div>
            )}
          </div>
        </div>

        {/* Validation and Preview result */}
        <div className="oh-form-stack" style={{ gap: 'var(--space-4)' }}>
          {validating && (
            <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface)' }}>
              <p>Validating spreadsheet constraints...</p>
            </div>
          )}

          {errors.length > 0 && (
            <article className="oh-import-errors" style={{ border: '1px solid var(--color-red-200)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: '#fff5f5', color: '#c53030' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 var(--space-3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertTriangle size={18} /> Row Validation Errors Detected
              </h2>
              <p style={{ fontSize: '0.9rem', marginBottom: 'var(--space-3)' }}>The import has been blocked. Please correct the errors in your workbook and upload again.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: '250px', overflowY: 'auto' }}>
                {errors.map((err, index) => (
                  <p key={index} style={{ fontSize: '0.85rem', margin: 0 }}>
                    <strong>Row {err.rowNumber} · {err.field}</strong>: {err.message}
                  </p>
                ))}
              </div>
            </article>
          )}

          {previewData && errors.length === 0 && (
            <article className="oh-import-preview" style={{ border: '1px solid var(--color-primary-200)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-primary-50)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <FileSpreadsheet size={28} style={{ color: 'var(--color-primary-600)' }} />
                <div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Ready to Import</h2>
                  <p style={{ fontSize: '0.85rem', margin: 0 }}>
                    {activeTemplate === 'item_master' ? (
                      `Categories: ${previewData.categories.length} · Consumables: ${previewData.consumables.length} · Equipment: ${previewData.equipment.length}`
                    ) : (
                      `Rows: ${previewData.generalRows.length}`
                    )}
                  </p>
                  <small style={{ color: 'var(--color-text-muted)' }}>Validate and confirm. Changes will commit atomically.</small>
                </div>
              </div>
              <Button onClick={handleConfirmImport} loading={committing} style={{ width: '100%' }}>
                Confirm & Commit Import
              </Button>
            </article>
          )}

          {completedReport && (
            <article className="oh-import-preview" style={{ border: '1px solid var(--color-success-200)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: '#f0fff4', color: '#22543d' }}>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                <CheckCircle2 size={28} style={{ color: 'var(--color-success-600)' }} />
                <div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Import Completed</h2>
                  <p style={{ fontSize: '0.85rem', margin: 0 }}>{completedReport.message}</p>
                </div>
              </div>
            </article>
          )}
        </div>

      </div>
    </section>
  )
}
