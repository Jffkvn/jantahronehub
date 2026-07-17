import { getSupabaseClient } from '../../../lib/supabase/client'

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  location: string | null;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface ItemCategory {
  id: string;
  name: string;
  description: string | null;
}

export interface EquipmentAsset {
  id: string;
  category_id: string;
  serial_number: string;
  model_name: string;
  status: 'available' | 'assigned' | 'maintenance' | 'damaged' | 'lost';
  current_warehouse_id: string | null;
  is_sensitive: boolean;
  condition_notes: string | null;
  item_categories?: { name: string };
  created_at: string;
}

export interface ConsumableItem {
  id: string;
  category_id: string;
  name: string;
  sku: string;
  unit_of_measure: string;
  reorder_level: number;
  item_categories?: { name: string };
  created_at: string;
}

export interface StockRequest {
  id: string;
  requested_by: string;
  project_id: string | null;
  project_name: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'fulfilled' | 'rejected';
  total_estimated_value: number;
  escalated_to_cfo: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  profiles_requested_by?: { display_name: string };
  profiles_approved_by?: { display_name: string };
  requester_name?: string;
  requester_role?: string;
}

export interface StockRequestItem {
  id: string;
  request_id: string;
  consumable_item_id: string | null;
  equipment_asset_id: string | null;
  quantity: number;
  quantity_issued?: number;
  fulfilled_by?: string | null;
  fulfilled_at?: string | null;
  estimated_unit_price: number;
  consumable_items?: { name: string; sku: string; unit_of_measure: string };
  equipment_assets?: { model_name: string; serial_number: string };
}

export interface StockMovement {
  id: string;
  movement_type: 'receipt' | 'issue' | 'return' | 'adjustment_add' | 'adjustment_remove';
  warehouse_id: string;
  consumable_item_id: string | null;
  equipment_asset_id: string | null;
  quantity: number;
  reference_id: string;
  performed_by: string;
  created_at: string;
  warehouses?: { name: string };
  consumable_items?: { name: string; sku: string };
  equipment_assets?: { model_name: string; serial_number: string };
  profiles_performed_by?: { display_name: string };
}

export interface InventorySettings {
  singleton: boolean;
  approval_mode: 'warehouse_manager_only' | 'threshold_escalation' | 'cfo_approval_all';
  cfo_threshold: number;
  critical_stock_escalation: boolean;
}

export interface StockReceiptInputItem {
  consumable_item_id: string
  quantity: number
  unit_price: number
}

export interface ConsumableMasterInput {
  categoryId: string
  newCategoryName: string
  newCategoryDescription: string
  name: string
  sku: string
  unitOfMeasure: string
  reorderLevel: number
}

export interface ReceiptEvidenceInput {
  warehouseId: string
  supplierName: string
  grnNumber: string
  invoiceNumber: string
  receivedDate: string
  purchaseValue: number
}

export interface StockRequestInputItem {
  consumable_item_id: string | null
  equipment_asset_id: string | null
  quantity: number
  expected_return_date?: string | null
}

interface InventoryRpcResult {
  data: unknown
  error: unknown
}

export interface InventoryRpcClient {
  rpc(
    functionName: string,
    parameters?: Record<string, unknown>,
  ): PromiseLike<InventoryRpcResult>
}

export function createInventoryApi(
  client: InventoryRpcClient = getSupabaseClient() as unknown as InventoryRpcClient,
) {
  return {
    async requestStock(projectId: string, items: StockRequestInputItem[]): Promise<string> {
      const { data, error } = await client.rpc('rpc_request_stock', {
        p_project_id: projectId,
        p_items: items,
      })
      if (error) throw error
      return data as string
    },
  }
}

const guardedInventoryApi = createInventoryApi()

export interface BulkCategory {
  name: string
  description: string
}

export interface BulkConsumable {
  name: string
  sku: string
  category_name: string
  unit_of_measure: string
  reorder_level: number
}

export interface BulkEquipment {
  model_name: string
  serial_number: string
  category_name: string
  current_warehouse_name: string
  is_sensitive: boolean
  condition_notes: string
}

export interface BulkGeneralRow {
  receipt_reference?: string
  warehouse_name: string
  sku_or_serial?: string
  sku?: string
  quantity: number
  unit_price?: number
  reason?: string
}

// API methods
export const inventoryApi = {
  async listWarehouses(): Promise<Warehouse[]> {
    const { data, error } = await getSupabaseClient()
      .from('warehouses')
      .select('*')
      .order('name')
    if (error) throw error
    return data || []
  },

  async listCategories(): Promise<ItemCategory[]> {
    const { data, error } = await getSupabaseClient()
      .from('item_categories')
      .select('*')
      .order('name')
    if (error) throw error
    return data || []
  },

  async listEquipment(): Promise<EquipmentAsset[]> {
    const { data, error } = await getSupabaseClient()
      .from('equipment_assets')
      .select('*, item_categories(name)')
      .order('model_name')
    if (error) throw error
    return (data || []) as unknown as EquipmentAsset[]
  },

  async listConsumables(): Promise<ConsumableItem[]> {
    const { data, error } = await getSupabaseClient()
      .from('consumable_items')
      .select('*, item_categories(name)')
      .order('name')
    if (error) throw error
    return (data || []) as unknown as ConsumableItem[]
  },

  async listRequests(): Promise<StockRequest[]> {
    const { data, error } = await getSupabaseClient().rpc('rpc_list_stock_requests', {
      p_request_id: null,
    })
    if (error) throw error
    return (data || []) as unknown as StockRequest[]
  },

  async getRequest(requestId: string): Promise<StockRequest | null> {
    const { data, error } = await getSupabaseClient().rpc('rpc_list_stock_requests', {
      p_request_id: requestId,
    })
    if (error) throw error
    return ((data || []) as unknown as StockRequest[])[0] || null
  },

  async getRequestItems(requestId: string): Promise<StockRequestItem[]> {
    const { data, error } = await getSupabaseClient()
      .from('stock_request_items')
      .select('*, consumable_items(name, sku, unit_of_measure), equipment_assets(model_name, serial_number)')
      .eq('request_id', requestId)
    if (error) throw error
    return (data || []) as unknown as StockRequestItem[]
  },

  async listMovements(): Promise<StockMovement[]> {
    const { data, error } = await getSupabaseClient()
      .from('stock_movements')
      .select('*, warehouses(name), consumable_items(name, sku), equipment_assets(model_name, serial_number), profiles_performed_by:profiles!performed_by(display_name)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as unknown as StockMovement[]
  },

  async getSettings(): Promise<InventorySettings> {
    const { data, error } = await getSupabaseClient()
      .from('inventory_settings')
      .select('*')
      .single()
    if (error) throw error
    return data
  },

  async updateSettings(settings: Partial<InventorySettings>): Promise<void> {
    const { error } = await getSupabaseClient()
      .from('inventory_settings')
      .update(settings)
      .eq('singleton', true)
    if (error) throw error
  },

  // RPC procedures
  async receiveStock(warehouseId: string, referenceNumber: string, items: StockReceiptInputItem[]): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('rpc_receive_stock', {
      p_warehouse_id: warehouseId,
      p_reference_number: referenceNumber,
      p_items: items
    })
    if (error) throw error
    return data as string;
  },

  async createConsumableItem(item: ConsumableMasterInput): Promise<string> {
    const creatingCategory = item.categoryId === '__new__'
    const { data, error } = await getSupabaseClient().rpc('rpc_create_consumable_item_inline', {
      p_category_id: creatingCategory ? null : item.categoryId,
      p_category_name: creatingCategory ? item.newCategoryName : null,
      p_category_description: creatingCategory ? item.newCategoryDescription : null,
      p_name: item.name, p_sku: item.sku,
      p_unit_of_measure: item.unitOfMeasure, p_reorder_level: item.reorderLevel
    })
    if (error) throw error
    return data as string
  },

  async receiveConsumable(itemId: string | null, item: ConsumableMasterInput | null, receipt: ReceiptEvidenceInput, quantity: number): Promise<void> {
    const creatingCategory = item?.categoryId === '__new__'
    const { error } = await getSupabaseClient().rpc('rpc_receive_consumable_inline', {
      p_item_id: itemId, p_category_id: creatingCategory ? null : item?.categoryId ?? null,
      p_category_name: creatingCategory ? item?.newCategoryName : null,
      p_category_description: creatingCategory ? item?.newCategoryDescription : null,
      p_name: item?.name ?? null,
      p_sku: item?.sku ?? null, p_unit_of_measure: item?.unitOfMeasure ?? null,
      p_reorder_level: item?.reorderLevel ?? 0, p_warehouse_id: receipt.warehouseId,
      p_warehouse_code: null, p_warehouse_name: null, p_warehouse_location: null,
      p_supplier_name: receipt.supplierName, p_grn_number: receipt.grnNumber,
      p_invoice_number: receipt.invoiceNumber, p_received_date: receipt.receivedDate,
      p_quantity: quantity, p_unit_price: receipt.purchaseValue
    })
    if (error) throw error
  },

  async receiveNewEquipment(asset: {
    categoryId: string; newCategoryName: string; newCategoryDescription: string
    modelName: string; serialNumber: string; isSensitive: boolean; conditionNotes: string
  }, receipt: ReceiptEvidenceInput): Promise<void> {
    const creatingCategory = asset.categoryId === '__new__'
    const { error } = await getSupabaseClient().rpc('rpc_receive_new_equipment_inline', {
      p_category_id: creatingCategory ? null : asset.categoryId,
      p_category_name: creatingCategory ? asset.newCategoryName : null,
      p_category_description: creatingCategory ? asset.newCategoryDescription : null,
      p_model_name: asset.modelName, p_serial_number: asset.serialNumber,
      p_is_sensitive: asset.isSensitive, p_condition_notes: asset.conditionNotes,
      p_warehouse_id: receipt.warehouseId, p_supplier_name: receipt.supplierName,
      p_warehouse_code: null, p_warehouse_name: null, p_warehouse_location: null,
      p_grn_number: receipt.grnNumber, p_invoice_number: receipt.invoiceNumber,
      p_received_date: receipt.receivedDate, p_purchase_value: receipt.purchaseValue
    })
    if (error) throw error
  },

  requestStock: guardedInventoryApi.requestStock,

  async approveRequest(requestId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('rpc_approve_stock_request', {
      p_request_id: requestId
    })
    if (error) throw error
  },

  async issueStock(requestId: string, warehouseId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('rpc_issue_stock', {
      p_request_id: requestId,
      p_warehouse_id: warehouseId
    })
    if (error) throw error
  },

  async issueRequestItem(requestItemId: string, warehouseId: string, issueCondition: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('rpc_issue_request_item', {
      p_request_item_id: requestItemId,
      p_warehouse_id: warehouseId,
      p_issue_condition: issueCondition
    })
    if (error) throw error
  },

  async returnAsset(equipmentAssetId: string, condition: string, warehouseId: string, notes: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('rpc_return_asset', {
      p_equipment_asset_id: equipmentAssetId,
      p_condition: condition,
      p_warehouse_id: warehouseId,
      p_notes: notes
    })
    if (error) throw error
  },

  async adjustStock(warehouseId: string, consumableItemId: string | null, equipmentAssetId: string | null, quantity: number, reason: string): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('rpc_adjust_stock', {
      p_warehouse_id: warehouseId,
      p_consumable_item_id: consumableItemId,
      p_equipment_asset_id: equipmentAssetId,
      p_quantity: quantity,
      p_reason: reason
    })
    if (error) throw error
    return data as string;
  },

  async escalateRequest(requestId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('rpc_escalate_stock_request', {
      p_request_id: requestId
    })
    if (error) throw error
  },

  async bulkImportItemMaster(categories: BulkCategory[], consumables: BulkConsumable[], equipment: BulkEquipment[]): Promise<void> {
    const { error } = await getSupabaseClient().rpc('rpc_bulk_import_item_master', {
      p_categories: categories,
      p_consumables: consumables,
      p_equipment: equipment
    })
    if (error) throw error
  },

  async bulkReceiveStock(rows: BulkGeneralRow[]): Promise<void> {
    const { error } = await getSupabaseClient().rpc('rpc_bulk_receive_stock', {
      p_rows: rows
    })
    if (error) throw error
  },

  async bulkOpeningStock(rows: BulkGeneralRow[]): Promise<void> {
    const { error } = await getSupabaseClient().rpc('rpc_bulk_opening_stock', {
      p_rows: rows
    })
    if (error) throw error
  },

  async bulkAdjustStock(rows: BulkGeneralRow[]): Promise<void> {
    const { error } = await getSupabaseClient().rpc('rpc_bulk_adjust_stock', {
      p_rows: rows
    })
    if (error) throw error
  }
}
