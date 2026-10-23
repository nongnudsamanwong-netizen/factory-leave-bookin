const { chromium } = require('playwright');
const XLSX = require('/home/claude/factory-leave-booking/node_modules/xlsx');
// Run: start PostgREST on :3001 over a test DB, `node proxy.cjs`, `npm run dev`, then
// OUT=./shots D=<future yyyy-mm-dd> node tests/e2e/e2e.cjs   (needs `npm i playwright`)
const OUT = process.env.OUT; const D = process.env.D; // booking date yyyy-mm-dd
const log = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('PAGEERROR', e.message));
  const login = async (id, pin) => {
    await page.goto('http://localhost:5173');
    await page.fill('input[aria-label="รหัสพนักงาน"]', id);
    await page.click('button:has-text("Login")');
    if (pin) { await page.fill('input[aria-label="รหัส PIN ผู้ดูแลระบบ"]', pin); await page.click('button:has-text("Login")'); }
  };
  const logout = async () => { await page.click('button:has-text("ออกจากระบบ")'); await page.waitForSelector('text=รหัสพนักงาน'); };
  const cell = () => page.locator(`button[aria-label^="${D} "]`);
  const book = async (reason) => {
    await page.waitForSelector('text=การจองวันลาของฉัน'); await page.waitForTimeout(600);
    await cell().click();
    if (reason) { await page.fill('textarea', reason); await page.click('button:has-text("Save Booking")'); }
  };

  // Test 8
  await login('NOPE999');
  await page.waitForSelector('text=ไม่พบรหัสพนักงานนี้');
  await page.screenshot({ path: OUT + '/01_login_unknown.png' }); log('PASS T8 unknown ID rejected in UI');

  // Test 1
  await login('EMP001'); await book('ธุระส่วนตัว');
  await page.waitForSelector('text=บันทึกการจองวันลาเรียบร้อยแล้ว'); await page.waitForTimeout(800);
  log('T1 cell label:', await cell().getAttribute('aria-label'));
  await page.screenshot({ path: OUT + '/02_calendar_after_booking.png', fullPage: true });
  await logout();

  await login('EMP002'); await book('พาลูกไปหาหมอ'); await page.waitForSelector('text=บันทึกการจองวันลาเรียบร้อยแล้ว'); await logout();

  // Test 2
  await login('EMP003'); await book(null);
  await page.waitForSelector('text=กะนี้มีผู้จองวันลาพักร้อนครบจำนวนแล้ว');
  await page.screenshot({ path: OUT + '/03_quota_full_modal.png' });
  log('PASS T2 full message shown; Save button visible =', await page.locator('button:has-text("Save Booking")').count());
  await page.click('button:has-text("Cancel")'); await logout();

  // Test 3
  await login('EMP004'); await book('งานบวชน้องชาย'); await page.waitForSelector('text=บันทึกการจองวันลาเรียบร้อยแล้ว');
  await page.waitForTimeout(800); log('T3 cell label:', await cell().getAttribute('aria-label')); await logout();

  // Admin + Test 4
  await login('ADMIN01', '246810');
  await page.waitForSelector('text=การจองทั้งหมด'); await page.click('aside >> text=การจองทั้งหมด');
  await page.waitForSelector('table'); 
  await page.click('button:has-text("Add Special Booking")');
  await page.fill('input[placeholder="พิมพ์เพื่อค้นหา"]', 'EMP003');
  const opt = await page.locator('select >> option', { hasText: 'EMP003' }).getAttribute('value');
  await page.selectOption('div[role=dialog] select', opt);
  await page.fill('div[role=dialog] input[type=date]', D);
  await page.fill('input[placeholder^="เช่น SUP01"]', 'SUP01 สมศักดิ์ หัวหน้ากะ A');
  await page.locator('div[role=dialog] textarea').first().fill('งานศพญาติ');
  await page.screenshot({ path: OUT + '/04_special_booking_form.png' });
  await page.click('button:has-text("ตรวจสอบและยืนยัน")');
  await page.waitForSelector('text=หลังบันทึก');
  await page.click('button:has-text("ยืนยันการจองพิเศษ")');
  await page.waitForSelector('text=บันทึกการจองพิเศษ'); await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + '/05_admin_bookings.png', fullPage: true }); log('PASS T4 special booking saved via UI');

  // Test 6: filter month + shift A, export
  await page.selectOption('form select >> nth=1', 'A');
  await page.click('button:has-text("ค้นหา")'); await page.waitForTimeout(800);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export to Excel")')]);
  const fname = dl.suggestedFilename(); await dl.saveAs(OUT + '/' + fname);
  const wb = XLSX.readFile(OUT + '/' + fname); const rows = XLSX.utils.sheet_to_json(wb.Sheets['Bookings'], { header: 1 });
  log('T6 file:', fname, '| sheets:', wb.SheetNames.join(','), '| headers:', rows[0].length, '| data rows:', rows.length - 1,
      '| shifts:', [...new Set(rows.slice(1).map(r => r[4]))].join(','), '| types:', rows.slice(1).map(r => r[9]).join(','));
  log('T6 sample row:', JSON.stringify(rows[1]));
  log('T6 info sheet filters:', JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets['Report Info'], { header: 1 }).slice(10)));

  // Test 9: cancel first booking
  await page.locator('button[aria-label="ยกเลิก"]').first().click();
  await page.click('button:has-text("ยืนยันการยกเลิก")'); await page.waitForSelector('text=ยกเลิกการจอง #');
  await page.click('aside >> text=ปฏิทินวันลา'); await page.waitForTimeout(1200);
  log('T9 cell after cancel:', await cell().getAttribute('aria-label'));
  await page.screenshot({ path: OUT + '/06_admin_calendar.png', fullPage: true });
  await page.click('aside >> text=จัดการพนักงาน'); await page.waitForSelector('table');
  await page.screenshot({ path: OUT + '/07_admin_employees.png' });
  await page.click('aside >> text=ประวัติการแก้ไข'); await page.waitForTimeout(1000);
  await page.screenshot({ path: OUT + '/08_audit_log.png' });
  await logout();

  // Mobile
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mp = await m.newPage(); await mp.goto('http://localhost:5173');
  await mp.fill('input[aria-label="รหัสพนักงาน"]', 'EMP005'); await mp.click('button:has-text("Login")');
  await mp.waitForSelector('text=การจองวันลาของฉัน'); await mp.waitForTimeout(800);
  await mp.screenshot({ path: OUT + '/09_mobile_calendar.png' });
  await mp.locator(`button[aria-label^="${D} "]`).click(); await mp.waitForTimeout(400);
  await mp.screenshot({ path: OUT + '/10_mobile_booking_modal.png' });
  await browser.close(); log('E2E DONE');
})().catch(e => { console.error('E2E FAIL', e); process.exit(1); });
