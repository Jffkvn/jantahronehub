import { EmptyPayslipState, PortalHeader } from './shared'

export function MyPayslipsPage() {
  return (
    <>
      <PortalHeader
        eyebrow="Payroll"
        title="My Payslips"
        description="Published payslips will be listed here after payroll is implemented."
      />
      <EmptyPayslipState />
    </>
  )
}
