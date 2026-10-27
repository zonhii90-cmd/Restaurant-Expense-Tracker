import {supabase} from './client';
import type {PurchaseLine,Unit} from './domain';
export type Snapshot={id:string;date:string;supplier:string;invoice:string|null;notes:string|null;receipt_path:string|null;created_by:string;created_at:string;entered_by:string;revision:number;status:'active'|'voided';lines:{id:string;item_id:string;name:string;quantity:string;unit:Unit;amount:string}[]};
export type CorrectionRequest={id:string;purchase_id:string;actor_name:string;reason:string;status:'pending'|'corrected'|'voided'|'declined';created_at:string;resolved_at:string|null;resolution:string|null;purchase_revision:number};
export type Change={id:string;actor_name:string;action:string;reason:string;created_at:string;before_data:Snapshot;after_data:Snapshot};
export type Detail={purchase:Snapshot;requests:CorrectionRequest[];changes:Change[]};
export async function purchaseDetail(id:string):Promise<Detail>{
 const {data,error}=await supabase!.rpc('restaurant_purchase_detail',{p_id:id});if(error)throw error;
 if(!data?.purchase || !Array.isArray(data.requests) || !Array.isArray(data.changes))throw new Error('Purchase corrections are not ready. Please finish database setup.');return data;
}
export function correctionError(error:unknown){
 const code=typeof error==='object' && error && 'code' in error?String(error.code):'';
 if(['PGRST202','PGRST205','42883','42P01','42703'].includes(code))return 'Purchase corrections are not ready. Please finish database setup.';
 if(code==='40001')return 'This purchase has changed. Refresh it before trying again.';
 if(code==='42501')return 'You do not have permission for this operation. Check your account access.';
 if(code==='22023' && typeof error==='object' && error && 'message' in error)return String(error.message);
 return error instanceof Error && error.message.includes('not ready')?error.message:'Unable to confirm this operation. Refresh the purchase to check its status before trying again.';
}
export function snapshotLines(p:Snapshot):PurchaseLine[]{return p.lines.map(l=>({id:l.id,purchase_id:p.id,purchase_date:p.date,invoice_number:p.invoice,created_by:p.created_by,supplier_id:'',supplier_name:p.supplier,item_id:l.item_id,item_name:l.name,quantity:Number(l.quantity),unit:l.unit,total_amount:Number(l.amount),unit_price:Number(l.amount)/Number(l.quantity),receipt_path:p.receipt_path,status:p.status,revision:p.revision,notes:p.notes,entered_by:p.entered_by}));}
export async function requestCorrection(operation:string,p:Snapshot,reason:string){const {error}=await supabase!.rpc('restaurant_request_correction',{p_operation:operation,p_purchase:p.id,p_revision:p.revision,p_reason:reason});if(error)throw error;}
export async function resolvePurchase(operation:string,p:Snapshot,action:string,reason:string,data:unknown,request:string|null){const {error}=await supabase!.rpc('restaurant_resolve_purchase',{p_operation:operation,p_purchase:p.id,p_revision:p.revision,p_action:action,p_reason:reason,p_data:data,p_request:request});if(error)throw error;}
