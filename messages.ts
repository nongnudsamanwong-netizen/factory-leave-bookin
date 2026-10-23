import { ApiError } from './api';

export const QUOTA_FULL_MESSAGE =
  'กะนี้มีผู้จองวันลาพักร้อนครบจำนวนแล้ว กรุณาติดต่อหัวหน้างานหรือผู้ดูแลระบบเพื่อขออนุมัติเป็นกรณีพิเศษ';

const MESSAGES: Record<string, string> = {
  QUOTA_FULL: QUOTA_FULL_MESSAGE,
  EMPLOYEE_NOT_FOUND: 'ไม่พบรหัสพนักงานนี้ในระบบ หรือรหัสถูกปิดการใช้งาน กรุณาตรวจสอบอีกครั้ง',
  INVALID_EMPLOYEE_ID: 'รูปแบบรหัสพนักงานไม่ถูกต้อง (ใช้ตัวอักษรภาษาอังกฤษ ตัวเลข - หรือ _ เท่านั้น)',
  PIN_LOCKED: 'ใส่รหัส PIN ผิดหลายครั้ง บัญชีผู้ดูแลถูกล็อก 15 นาที',
  PIN_NOT_CONFIGURED: 'บัญชีผู้ดูแลนี้ยังไม่ได้ตั้งรหัส PIN กรุณาติดต่อผู้ดูแลระบบหลัก',
  INVALID_PIN: 'รหัส PIN ต้องเป็นตัวเลข 6–12 หลัก',
  UNAUTHORIZED: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  FORBIDDEN: 'คุณไม่มีสิทธิ์ใช้งานฟังก์ชันนี้',
  DUPLICATE_BOOKING: 'คุณได้จองวันลาวันนี้ไว้แล้ว ไม่สามารถจองซ้ำได้',
  PAST_DATE: 'ไม่สามารถจองหรือแก้ไขวันที่ผ่านมาแล้วได้',
  TOO_FAR_AHEAD: 'สามารถจองล่วงหน้าได้ไม่เกิน 365 วัน',
  INVALID_DATE: 'วันที่ไม่ถูกต้อง',
  REASON_REQUIRED: 'กรุณากรอกเหตุผลการลา',
  REASON_TOO_LONG: 'เหตุผลการลายาวเกิน 500 ตัวอักษร',
  ALREADY_CANCELLED: 'รายการนี้ถูกยกเลิกไปแล้ว',
  NOT_FOUND: 'ไม่พบข้อมูล',
  EMPLOYEE_ID_EXISTS: 'รหัสพนักงานนี้มีอยู่ในระบบแล้ว',
  INVALID_SHIFT: 'กะไม่ถูกต้อง',
  INVALID_ROLE: 'สิทธิ์ผู้ใช้ไม่ถูกต้อง',
  INVALID_NAME: 'กรุณากรอกชื่อ-นามสกุล (ไม่เกิน 120 ตัวอักษร)',
  INVALID_DEPARTMENT: 'กรุณากรอกแผนก (ไม่เกิน 80 ตัวอักษร)',
  CANNOT_DEMOTE_SELF: 'ไม่สามารถลดสิทธิ์หรือปิดการใช้งานบัญชีของตัวเองได้',
  NOT_ADMIN: 'ตั้ง PIN ได้เฉพาะบัญชีผู้ดูแลระบบ',
  APPROVER_REQUIRED: 'กรุณาระบุชื่อหรือรหัสของหัวหน้าที่อนุมัติ',
  APPROVAL_TIME_REQUIRED: 'กรุณาระบุวันและเวลาที่อนุมัติ',
  APPROVAL_TIME_FUTURE: 'วันเวลาที่อนุมัติต้องไม่เป็นเวลาในอนาคต',
  INVALID_RANGE: 'ช่วงวันที่ไม่ถูกต้อง',
  NETWORK: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  NOT_CONFIGURED: 'ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)',
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return MESSAGES[err.code] ?? `เกิดข้อผิดพลาด (${err.code})`;
  return 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง';
}

export const SHIFT_LABEL = { A: 'กะ A', B: 'กะ B' } as const;
export const STATUS_LABEL = { active: 'ใช้งาน', cancelled: 'ยกเลิกแล้ว' } as const;
export const TYPE_LABEL = { normal: 'ปกติ', special: 'พิเศษ' } as const;
