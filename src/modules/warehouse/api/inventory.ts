import { getSupabaseClient } from '../../../lib/supabase/client'

export interface Warehouse {
  id: string;
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

export interface StockRequestInputItem {
  consumable_item_id: string | null
  equipment_asset_id: string | null
  quantity: number
  estimated_unit_price: number
}

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
    const { data, error } = await getSupabaseClient()
      .from('stock_requests')
      .select('*, profiles_requested_by:profiles!requested_by(display_name), profiles_approved_by:profiles!approved_by(display_name)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as unknown as StockRequest[]
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

  async requestStock(projectName: string, items: StockRequestInputItem[]): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('rpc_request_stock', {
      p_project_name: projectName,
      p_items: items
    })
    if (error) throw error
    return data as string;
  },

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
