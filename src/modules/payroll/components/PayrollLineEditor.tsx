import type { PayrollDraftItem } from '../types'

export function PayrollLineEditor({employeeName,value,locked,onChange,onDefer}:{employeeName:string;value:PayrollDraftItem;locked:boolean;onChange(value:PayrollDraftItem):void;onDefer():void}) {
  const update=(key:'percentOfMonthWorked'|'overtimeHours', raw:string)=>onChange({...value,[key]:Number(raw)})
  const addLine=(kind:'allowance'|'salary_advance'|'deduction')=>onChange({...value,lineItems:[...value.lineItems,{kind,code:`${kind==='salary_advance'?'ADVANCE':kind.toUpperCase()}_${value.lineItems.length+1}`,description:kind==='salary_advance'?'Salary advance repayment':kind==='allowance'?'Payroll allowance':'Payroll deduction',amount:1}]})
  const updateLine=(index:number,key:'description'|'amount',raw:string)=>onChange({...value,lineItems:value.lineItems.map((line,lineIndex)=>lineIndex===index?{...line,[key]:key==='amount'?Number(raw):raw}:line)})
  return <div className="payroll-line-editor">
    <div><strong>{employeeName}</strong><span>{locked ? 'Approved and locked' : 'Draft calculation inputs'}</span></div>
    <label>Percentage worked<input aria-label={`Percentage worked for ${employeeName}`} type="number" min="0" max="100" step="0.01" value={value.percentOfMonthWorked} disabled={locked} onChange={(e)=>update('percentOfMonthWorked',e.target.value)} /></label>
    <label>Overtime hours<input aria-label={`Overtime hours for ${employeeName}`} type="number" min="0" step="0.25" value={value.overtimeHours} disabled={locked} onChange={(e)=>update('overtimeHours',e.target.value)} /></label>
    {!locked && <button className="oh-button oh-button--secondary" type="button" aria-label={`Defer ${employeeName} from this payroll`} onClick={onDefer}>Defer from run</button>}
    <div className="payroll-adjustments">
      {value.lineItems.map((line,index)=><div key={`${line.kind}-${line.code}`}><span>{line.kind.replace('_',' ')}</span><input aria-label={`${line.kind} description for ${employeeName}`} value={line.description} disabled={locked} onChange={(e)=>updateLine(index,'description',e.target.value)}/><input aria-label={`${line.kind} amount for ${employeeName}`} type="number" min="1" value={line.amount} disabled={locked} onChange={(e)=>updateLine(index,'amount',e.target.value)}/>{!locked&&<button type="button" className="oh-text-link" onClick={()=>onChange({...value,lineItems:value.lineItems.filter((_,lineIndex)=>lineIndex!==index)})}>Remove</button>}</div>)}
      {!locked&&<div className="payroll-adjustment-actions"><button type="button" className="oh-text-link" onClick={()=>addLine('allowance')}>+ Allowance</button><button type="button" className="oh-text-link" onClick={()=>addLine('salary_advance')}>+ Advance repayment</button><button type="button" className="oh-text-link" onClick={()=>addLine('deduction')}>+ Deduction</button></div>}
    </div>
  </div>
}
