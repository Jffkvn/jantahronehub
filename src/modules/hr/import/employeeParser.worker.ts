/// <reference lib="webworker" />
import { parseEmployeeWorkbook } from './employeeParser'

self.onmessage = async (event: MessageEvent<File>) => {
  try { self.postMessage({ rows: await parseEmployeeWorkbook(event.data) }) }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Workbook could not be read.' }) }
}
