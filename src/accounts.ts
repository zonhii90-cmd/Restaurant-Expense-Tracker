import { supabase } from './client';
import { monthRange } from './domain';
export type StaffAccount={user_id:string;email:string;display_name:string;role:'staff'|'manager';active:boolean;created_at:string;last_sign_in_at:string|null};
export type LoginEvent={id:string;user_id:string;email:string;display_name:string;role_at_login:'staff'|'manager';access_granted:boolean;signed_in_at:string};
export async function staffDirectory():Promise<StaffAccount[]> {
  const rows:StaffAccount[]=[];
  for(let offset=0;;offset+=1000){
    const {data,error}=await supabase!.rpc('restaurant_staff_directory').range(offset,offset+999);
    if(error)throw error;
    rows.push(...data || []);
    if(!data || data.length<1000)return rows;
  }
}
export async function setStaffActive(user_id:string,active:boolean){
  const {error}=await supabase!.rpc('restaurant_set_staff_active',{p_user_id:user_id,p_active:active});
  if(error)throw error;
}
export async function administerStaff(body:{action:'create_staff';email:string;display_name:string;password:string}|{action:'reset_password';user_id:string;password:string}){
  const {data,error}=await supabase!.functions.invoke('staff-admin',{body});
  if(error){
    if('context' in error && error.context instanceof Response){
      if(error.context.status===404)throw new Error('Account management is not ready. Please finish server setup.');
      const result=await error.context.json().catch(()=>null);
      if(result?.error)throw new Error(String(result.error));
    }
    throw new Error('Unable to confirm this request. Refresh staff accounts before trying again.');
  }
  if(!data?.ok)throw new Error('The request was not confirmed. Refresh staff accounts before trying again.');
}
export async function loginHistory(month:string,userId:string,page:number):Promise<{rows:LoginEvent[];count:number}>{
  const range=monthRange(month);
  let query=supabase!.from('restaurant_login_history').select('*',{count:'exact'})
    .gte('signed_in_at',`${range.from}T00:00:00+08:00`).lt('signed_in_at',`${range.to}T00:00:00+08:00`);
  if(userId)query=query.eq('user_id',userId);
  const {data,error,count}=await query.order('signed_in_at',{ascending:false}).order('id',{ascending:false}).range(page*50,page*50+49);
  if(error)throw error;
  return {rows:data || [],count:count || 0};
}
export function accountError(error:unknown){
  const code=typeof error==='object' && error && 'code' in error ? String(error.code) : '';
  if(['PGRST202','PGRST205','42883','42P01','42703'].includes(code))return 'Account management is not ready. Please finish server setup before using this page.';
  if(code==='42501')return 'An active manager account is required.';
  return error instanceof Error ? error.message : 'Unable to load account records. Please refresh and try again.';
}
export function accountTime(value:string|null){
  if(!value)return 'Never signed in';
  return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuala_Lumpur',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));
}
