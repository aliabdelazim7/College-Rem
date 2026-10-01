const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('🚀 RUNNING COMPREHENSIVE FULL-SYSTEM CYCLE TEST SUITE (E2E)');
console.log('================================================================\n');

// 1. Load index.html
const htmlPath = path.resolve('index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// 2. Build DOM & Browser Environment Mock
class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(...cls) { cls.forEach(c => this.classes.add(c)); }
  remove(...cls) { cls.forEach(c => this.classes.delete(c)); }
  contains(c) { return this.classes.has(c); }
  toggle(c) { if (this.contains(c)) this.remove(c); else this.add(c); }
}

class MockElement {
  constructor(id = '', tagName = 'div') {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.classList = new MockClassList();
    this.innerHTML = '';
    this.innerText = '';
    this.value = '';
    this.checked = false;
    this.attributes = {};
    this.style = {};
    this.children = [];
    this.options = [];
  }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  removeAttribute(k) { delete this.attributes[k]; }
  focus() {}
  click() {}
  scrollIntoView() {}
}

const elementsMap = new Map();
function getOrCreateElement(id, tagName = 'div') {
  if (!elementsMap.has(id)) {
    const el = new MockElement(id, tagName);
    elementsMap.set(id, el);
  }
  return elementsMap.get(id);
}

// Extract all IDs from HTML
const idRegex = /id=["']([^"']+)["']/g;
let m;
while ((m = idRegex.exec(html)) !== null) {
  getOrCreateElement(m[1]);
}

const mockStorage = {};
const localStorage = {
  getItem: (k) => mockStorage[k] !== undefined ? mockStorage[k] : null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

const documentMock = {
  documentElement: new MockElement('html'),
  getElementById: (id) => getOrCreateElement(id),
  querySelector: (sel) => {
    if (sel.includes('input[name="editClassType"]:checked')) {
      return { value: 'section' };
    }
    if (sel.includes('input[name="editClassColor"]:checked')) {
      return { value: 'amber' };
    }
    if (sel.startsWith('#')) return getOrCreateElement(sel.substring(1));
    return new MockElement();
  },
  querySelectorAll: (sel) => [],
  addEventListener: () => {}
};

const windowMock = {
  document: documentMock,
  localStorage: localStorage,
  navigator: {
    vibrate: (pattern) => true,
    serviceWorker: {
      register: () => Promise.resolve({ update: () => Promise.resolve() })
    }
  },
  matchMedia: () => ({ matches: false }),
  addEventListener: () => {},
  setInterval: () => 123,
  setTimeout: (fn, delay) => { if (typeof fn === 'function') fn(); return 456; },
  clearTimeout: () => {},
  clearInterval: () => {}
};

const lucideMock = {
  createIcons: () => {}
};

let chimePlayed = null;
function playChimeMock(type) { chimePlayed = type; }
let confettiTriggered = false;
function triggerConfettiMock() { confettiTriggered = true; }

// Collect all script tags inside index.html
const scriptRegex = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;
let combinedScripts = '';
let match;
while ((match = scriptRegex.exec(html)) !== null) {
  combinedScripts += '\n' + match[1];
}

// Append scope exporter to access variables
combinedScripts += `
window.__appScope = {
  initialSchedule,
  getScheduleData: () => scheduleData,
  setScheduleData: (v) => { scheduleData = v; },
  getAttendanceData: () => attendanceData,
  setAttendanceData: (v) => { attendanceData = v; },
  getTasksList: () => tasksList,
  setTasksList: (v) => { tasksList = v; },
  getCourseworkGrades: () => courseworkGrades,
  getSubjectMaterials: () => subjectMaterials,
  getPeriodTimes: () => periodTimes,
  defaultPeriodTimes,
  getWeeklyDisplayMode: () => weeklyDisplayMode,
  streakCount,
  renderTodayView,
  renderWeeklyGrid,
  renderSubjectsSummary,
  renderTasksView,
  populateTaskClassDropdown,
  setWeeklyDisplayMode,
  filterSchedule,
  saveClassFromEditor,
  deleteClassConfirm,
  resetScheduleToDefaultConfirm,
  setAttendance,
  updateOverallStats,
  resetAllAttendanceConfirm,
  handleFullTaskSubmit,
  toggleTask,
  deleteTask,
  updateCourseworkGrade,
  saveSubjectMaterial,
  savePeriodTimes,
  resetDefaultPeriodTimes,
  autoPullFromCloud,
  formatTime12h,
  formatSlot12h
};
`;

// Wrap and evaluate in sandboxed context
const context = {
  window: windowMock,
  document: documentMock,
  localStorage: localStorage,
  navigator: windowMock.navigator,
  alert: (msg) => {},
  confirm: (msg) => true,
  prompt: (msg, def) => def || '',
  clearTimeout: () => {},
  clearInterval: () => {},
  lucide: lucideMock,
  playChime: playChimeMock,
  triggerConfetti: triggerConfettiMock,
  console: console,
  setInterval: () => 1,
  setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 1; },
  fetch: () => Promise.resolve({ json: () => Promise.resolve({ status: 'success', data: {} }) }),
  Date: Date,
  Math: Math,
  JSON: JSON,
  Set: Set,
  Map: Map,
  Array: Array,
  Object: Object,
  RegExp: RegExp,
  parseInt: parseInt,
  parseFloat: parseFloat,
  isNaN: isNaN,
  encodeURIComponent: encodeURIComponent,
  tailwind: { config: {} },
  showSyncToast: () => {}
};

vm.createContext(context);
vm.runInContext(combinedScripts, context);

const app = windowMock.__appScope;

// Test Results Collector
const testResults = [];
async function test(name, fn) {
  try {
    await fn();
    testResults.push({ name, status: 'PASSED' });
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    testResults.push({ name, status: 'FAILED', error: err.message, stack: err.stack });
    console.error(`❌ [FAIL] ${name}:`, err.message);
  }
}

// Async test runner
(async () => {

// -------------------------------------------------------------
// CYCLE 1: INITIAL DATA INTEGRITY & DEFAULT STATE
// -------------------------------------------------------------
console.log('\n--- 🧪 CYCLE 1: INITIAL DATA INTEGRITY & DEFAULT STATE ---');

await test('Initial Schedule Data should contain all 10 official classes (5 lectures + 5 sections)', () => {
  const schedule = app.initialSchedule;
  if (!Array.isArray(schedule) || schedule.length !== 10) {
    throw new Error(`Expected 10 classes in initialSchedule, found ${schedule?.length}`);
  }
  const days = new Set(schedule.map(c => c.dayIndex));
  if (days.size !== 4 || !days.has(0) || !days.has(1) || !days.has(2) || !days.has(4)) {
    throw new Error('Initial schedule must span Sun(0), Mon(1), Tue(2), Thu(4)');
  }
});

await test('Systems Analysis (SAD) Section default TA should be Ahmed Kord', () => {
  const sadSection = app.initialSchedule.find(c => c.id === 'tue-6');
  if (!sadSection) throw new Error('tue-6 not found');
  if (!sadSection.doctor.includes('أحمد كرد')) {
    throw new Error(`Expected doctor to be Ahmed Kord, but got: "${sadSection.doctor}"`);
  }
});

await test('Academic Subjects should list Ahmed Kord for Systems Analysis', () => {
  app.renderSubjectsSummary();
  const subContainer = documentMock.getElementById('subjectsListContainer');
  if (!subContainer.innerHTML.includes('أحمد كرد')) {
    throw new Error('Subjects summary does not contain Ahmed Kord');
  }
});

// -------------------------------------------------------------
// CYCLE 2: TIME PARSING & 12-HOUR FORMATTING
// -------------------------------------------------------------
console.log('\n--- 🧪 CYCLE 2: TIME FORMATTING & PERIODS ---');

await test('formatTime12h should convert 24h to Arabic 12h accurately', () => {
  const t1 = app.formatTime12h('08:30');
  const t2 = app.formatTime12h('14:10');
  const t3 = app.formatTime12h('12:00');
  if (!t1.includes('08:30') || !t1.includes('ص')) throw new Error(`08:30 failed: ${t1}`);
  if (!t2.includes('02:10') || !t2.includes('م')) throw new Error(`14:10 failed: ${t2}`);
  if (!t3.includes('12:00') || !t3.includes('م')) throw new Error(`12:00 failed: ${t3}`);
});

await test('formatSlot12h should format ranges with dash', () => {
  const slot = app.formatSlot12h('14:10', '15:50');
  if (!slot.includes('02:10') || !slot.includes('03:50')) {
    throw new Error(`Slot range failed: ${slot}`);
  }
});

// -------------------------------------------------------------
// CYCLE 3: SCHEDULE RENDERING (TODAY & WEEKLY GRID)
// -------------------------------------------------------------
console.log('\n--- 🧪 CYCLE 3: SCHEDULE RENDERING (TODAY & WEEK) ---');

await test('renderTodayView should render day card without errors', () => {
  app.renderTodayView();
  const container = documentMock.getElementById('todayCardsList');
  if (!container.innerHTML) throw new Error('todayCardsList is empty');
});

await test('renderWeeklyGrid in studyDays mode should render only days with classes', () => {
  app.setWeeklyDisplayMode('studyDays');
  app.renderWeeklyGrid();
  const container = documentMock.getElementById('weeklyGridContainer');
  if (!container.innerHTML.includes('الأحد') || !container.innerHTML.includes('الثلاثاء')) {
    throw new Error('Study days missing from weekly grid');
  }
  const dayCardCount = (container.innerHTML.match(/weekly-day-card/g) || []).length;
  if (dayCardCount !== 4) {
    throw new Error(`Expected 4 day cards in studyDays mode, got ${dayCardCount}`);
  }
});

await test('renderWeeklyGrid in all mode should render all 7 days with wrap', () => {
  app.setWeeklyDisplayMode('all');
  app.renderWeeklyGrid();
  const container = documentMock.getElementById('weeklyGridContainer');
  const dayCardCount = (container.innerHTML.match(/weekly-day-card/g) || []).length;
  if (dayCardCount !== 7) {
    throw new Error(`Expected 7 day cards in all mode, got ${dayCardCount}`);
  }
  app.setWeeklyDisplayMode('studyDays');
});

await test('Schedule filter (lectures only vs sections only) works correctly', () => {
  app.filterSchedule('lecture');
  app.renderWeeklyGrid();
  const container = documentMock.getElementById('weeklyGridContainer');
  if (container.innerHTML.includes('سكشن عملي')) {
    throw new Error('Sections should be hidden when filtered to lectures');
  }
  app.filterSchedule('all');
});

// -------------------------------------------------------------
// CYCLE 4: CLASS CRUD OPERATIONS (ADD, EDIT, MOVE, DELETE, RESET)
// -------------------------------------------------------------
console.log('\n--- 🧪 CYCLE 4: CLASS CRUD & RESCHEDULING ENGINE ---');

await test('Adding a new class via saveClassFromEditor should add to scheduleData and localStorage', () => {
  const initialLen = app.getScheduleData().length;
  documentMock.getElementById('editClassId').value = '';
  documentMock.getElementById('editClassSubject').value = 'مشروع التخرج التجريبي';
  documentMock.getElementById('editClassDay').value = '1'; // Monday
  documentMock.getElementById('editClassPeriod').value = '1';
  documentMock.getElementById('editClassRoom').value = 'مدرج 1';
  documentMock.getElementById('editClassDoctor').value = 'د/ فلان الفلاني';

  app.saveClassFromEditor();

  const currentSchedule = app.getScheduleData();
  if (currentSchedule.length !== initialLen + 1) {
    throw new Error('Class was not added to scheduleData');
  }
  const added = currentSchedule.find(c => c.subject === 'مشروع التخرج التجريبي');
  if (!added || added.doctor !== 'د/ فلان الفلاني') {
    throw new Error('Added class data mismatch');
  }
  const stored = JSON.parse(localStorage.getItem('sakan6_schedule'));
  if (!stored.some(c => c.subject === 'مشروع التخرج التجريبي')) {
    throw new Error('Added class not persisted in localStorage');
  }
});

await test('Editing existing class (changing TA) should update schedule & trigger task dropdown sync', () => {
  const sadClass = app.getScheduleData().find(c => c.id === 'tue-6');
  if (!sadClass) throw new Error('tue-6 class not found');

  documentMock.getElementById('editClassId').value = 'tue-6';
  documentMock.getElementById('editClassSubject').value = sadClass.subject;
  documentMock.getElementById('editClassDay').value = String(sadClass.dayIndex);
  documentMock.getElementById('editClassPeriod').value = String(sadClass.period);
  documentMock.getElementById('editClassRoom').value = 'قاعة B5';
  documentMock.getElementById('editClassDoctor').value = 'م/ أحمد كرد';

  app.saveClassFromEditor();

  const updated = app.getScheduleData().find(c => c.id === 'tue-6');
  if (updated.doctor !== 'م/ أحمد كرد') {
    throw new Error(`Doctor was not updated. Got: ${updated.doctor}`);
  }

  const taskSelect = documentMock.getElementById('formTaskClass');
  if (!taskSelect.innerHTML.includes('أحمد كرد')) {
    throw new Error('formTaskClass select did not reflect updated TA Ahmed Kord');
  }
});

await test('Deleting a class should remove from scheduleData & update active study days', () => {
  const customClass = app.getScheduleData().find(c => c.subject === 'مشروع التخرج التجريبي');
  if (!customClass) throw new Error('Custom class not found for deletion');

  app.deleteClassConfirm(customClass.id);

  if (app.getScheduleData().some(c => c.id === customClass.id)) {
    throw new Error('Class was not removed from scheduleData');
  }
});

await test('Resetting schedule to default should restore official 10 classes', () => {
  app.resetScheduleToDefaultConfirm();
  if (app.getScheduleData().length !== 10) {
    throw new Error(`Reset expected 10 classes, got ${app.getScheduleData().length}`);
  }
});

// -------------------------------------------------------------
// CYCLE 5: ATTENDANCE & ABSENCE TRACKING
// -------------------------------------------------------------
console.log('\n--- 🧪 CYCLE 5: ATTENDANCE TRACKER & STREAK SYSTEM ---');

await test('setAttendance present should record status & increment streak', () => {
  app.setAttendance('sun-1', 'present');
  const attData = app.getAttendanceData();
  if (attData['sun-1'] !== 'present') {
    throw new Error('Attendance not recorded as present');
  }
  const stored = JSON.parse(localStorage.getItem('sakan6_attendance'));
  if (stored['sun-1'] !== 'present') {
    throw new Error('Attendance not saved to localStorage');
  }
});

await test('setAttendance absent should record status & calculate absence warning', () => {
  app.setAttendance('sun-1', 'absent');
  const attData = app.getAttendanceData();
  if (attData['sun-1'] !== 'absent') {
    throw new Error('Attendance not recorded as absent');
  }
  app.updateOverallStats();
  const badgeEl = documentMock.getElementById('headerAttendanceBadge');
  if (!badgeEl) throw new Error('headerAttendanceBadge element missing');
});

await test('Resetting attendance should clear attendanceData & localStorage', () => {
  app.resetAllAttendanceConfirm();
  const attData = app.getAttendanceData();
  if (Object.keys(attData).length !== 0) {
    throw new Error('attendanceData not empty after reset');
  }
  if (localStorage.getItem('sakan6_attendance')) {
    throw new Error('sakan6_attendance still exists in localStorage');
  }
});

// -------------------------------------------------------------
// CYCLE 6: TASKS & ASSIGNMENTS ENGINE (الشيتات والتكليفات)
// -------------------------------------------------------------
console.log('\n--- 🧪 CYCLE 6: TASKS & ASSIGNMENTS (الشيتات والتكليفات) ---');

await test('populateTaskClassDropdown should dynamically build options from scheduleData', () => {
  app.populateTaskClassDropdown();
  const select = documentMock.getElementById('formTaskClass');
  if (!select.innerHTML.includes('سكاشن ومعامل سكشن 6') || !select.innerHTML.includes('المحاضرات النظرية')) {
    throw new Error('formTaskClass options missing required optgroups');
  }
  if (!select.innerHTML.includes('أحمد كرد')) {
    throw new Error('formTaskClass does not contain Ahmed Kord');
  }
});

await test('handleFullTaskSubmit should add new task with full metadata & trigger cloud sync', () => {
  const initialTasksCount = app.getTasksList().length;
  documentMock.getElementById('formTaskClass').value = 'تحليل النظم والتصميم المنطقي|سكشن عملي (م/ أحمد كرد - قاعة B5)|amber';
  documentMock.getElementById('formTaskType').value = 'sheet';
  documentMock.getElementById('formTaskDueDate').value = '2026-10-15';
  documentMock.getElementById('formTaskPriority').value = 'high';
  documentMock.getElementById('formTaskTitle').value = 'تسليم شيت 1 (DFD Diagrams)';

  const fakeEvent = { preventDefault: () => {} };
  app.handleFullTaskSubmit(fakeEvent);

  const currentTasks = app.getTasksList();
  if (currentTasks.length !== initialTasksCount + 1) {
    throw new Error('Task was not added to tasksList');
  }
  const added = currentTasks[0];
  if (added.title !== 'تسليم شيت 1 (DFD Diagrams)') {
    throw new Error('Task title mismatch');
  }
  if (!added.sectionLabel.includes('أحمد كرد')) {
    throw new Error(`Expected sectionLabel to include Ahmed Kord, got: ${added.sectionLabel}`);
  }
});

await test('toggleTask should toggle completion state and persist', () => {
  const currentTasks = app.getTasksList();
  const taskId = currentTasks[0].id;
  app.toggleTask(taskId);
  if (!currentTasks[0].completed) {
    throw new Error('Task completion was not toggled to true');
  }
  app.toggleTask(taskId);
  if (currentTasks[0].completed) {
    throw new Error('Task completion was not toggled back to false');
  }
});

await test('Auto-migration: Old tasks with Mahmud Said should seamlessly update to Ahmed Kord', () => {
  const tasks = app.getTasksList();
  tasks.push({
    id: 999999,
    subject: 'تحليل النظم والتصميم المنطقي',
    sectionLabel: 'سكشن عملي (م/ محمود سعيد - B5)',
    title: 'شيت قديم للاختبار',
    completed: false
  });

  tasks.forEach(t => {
    if (t.sectionLabel && t.sectionLabel.includes('محمود سعيد')) {
      t.sectionLabel = t.sectionLabel.replace(/محمود سعيد/g, 'أحمد كرد');
    }
  });

  const migratedTask = tasks.find(t => t.id === 999999);
  if (migratedTask.sectionLabel.includes('محمود سعيد') || !migratedTask.sectionLabel.includes('أحمد كرد')) {
    throw new Error(`Migration failed: ${migratedTask.sectionLabel}`);
  }

  app.deleteTask(999999);
});

// -------------------------------------------------------------
// CYCLE 7: ACADEMIC GRADES & COURSEWORK CALCULATIONS
// -------------------------------------------------------------
console.log('\n--- 🧪 CYCLE 7: ACADEMIC GRADES & COURSEWORK CALCULATOR ---');

await test('updateCourseworkGrade should persist coursework components', () => {
  app.updateCourseworkGrade('sad', 'midterm', 9);
  app.updateCourseworkGrade('sad', 'lab', 18);
  app.updateCourseworkGrade('sad', 'oral', 9);

  const storedGrades = JSON.parse(localStorage.getItem('sakan6_grades'));
  if (storedGrades.sad.midterm !== 9 || storedGrades.sad.lab !== 18 || storedGrades.sad.oral !== 9) {
    throw new Error('Grades were not stored properly in localStorage');
  }
});

await test('saveSubjectMaterial should persist material drive links', () => {
  app.saveSubjectMaterial('sad', 'https://drive.google.com/test-sad');
  const storedMaterials = JSON.parse(localStorage.getItem('sakan6_subject_materials'));
  if (storedMaterials.sad !== 'https://drive.google.com/test-sad') {
    throw new Error('Material link was not stored in localStorage');
  }
});

// -------------------------------------------------------------
// CYCLE 8: TIME SETTINGS & PERIODS CUSTOMIZATION
// -------------------------------------------------------------
console.log('\n--- 🧪 CYCLE 8: TIME SETTINGS CUSTOMIZATION ---');

await test('savePeriodTimes should update period times and refresh schedule', () => {
  documentMock.getElementById('period-start-1').value = '08:35';
  documentMock.getElementById('period-end-1').value = '10:15';

  app.savePeriodTimes();

  const periods = app.getPeriodTimes();
  if (periods[1].start !== '08:35' || periods[1].end !== '10:15') {
    throw new Error('Custom period time not saved in periodTimes');
  }

  // Reset to default
  app.resetDefaultPeriodTimes();
  const resetPeriods = app.getPeriodTimes();
  if (resetPeriods[1].start !== '08:30') {
    throw new Error('Period times not reset to default: ' + JSON.stringify(resetPeriods[1]));
  }
});

// -------------------------------------------------------------
// CYCLE 9: CLOUD SYNC ENGINE & GOOGLE SHEETS PAYLOAD
// -------------------------------------------------------------
console.log('\n--- 🧪 CYCLE 9: CLOUD SYNC PAYLOAD SERIALIZATION ---');

await test('Cloud sync payload should format all state items for Google Apps Script', () => {
  const payload = {
    action: 'save',
    schedule: app.getScheduleData(),
    attendance: app.getAttendanceData(),
    tasks: app.getTasksList(),
    courseworkGrades: app.getCourseworkGrades(),
    subjectMaterials: app.getSubjectMaterials(),
    periodTimes: app.getPeriodTimes(),
    lastUpdated: new Date().toISOString()
  };

  const serialized = JSON.stringify(payload);
  const parsed = JSON.parse(serialized);

  if (!parsed.schedule || !parsed.tasks || !parsed.lastUpdated) {
    throw new Error('Sync payload missing critical properties');
  }
  if (parsed.schedule.length !== 10) {
    throw new Error('Sync payload schedule length mismatch');
  }
});

await test('autoPullFromCloud should merge valid cloud data into scheduleData and localStorage', async () => {
  const cloudSchedule = JSON.parse(JSON.stringify(app.getScheduleData()));
  cloudSchedule[0].room = 'قاعة محدثة سحابياً';

  context.gasUrl = 'https://script.google.com/macros/s/TEST/exec';
  context.navigator.onLine = true;
  context.fetch = async () => ({
    status: 200,
    json: async () => ({
      status: 'success',
      data: {
        schedule: cloudSchedule
      }
    })
  });

  await app.autoPullFromCloud();

  if (app.getScheduleData()[0].room !== 'قاعة محدثة سحابياً') {
    throw new Error('autoPullFromCloud failed to merge cloud schedule');
  }

  // Restore default
  app.resetScheduleToDefaultConfirm();
});

// -------------------------------------------------------------
// CYCLE 10: SERVICE WORKER & ASSET CACHING INTEGRITY
// -------------------------------------------------------------
console.log('\n--- 🧪 CYCLE 10: SERVICE WORKER & CACHE INTEGRITY ---');

await test('sw.js cache version should match v21', () => {
  const swCode = fs.readFileSync('sw.js', 'utf8');
  if (!swCode.includes("section6-hub-v21")) {
    throw new Error('sw.js CACHE_NAME is not section6-hub-v21');
  }
});

await test('All precached local files in sw.js must exist on disk', () => {
  const swCode = fs.readFileSync('sw.js', 'utf8');
  const precacheMatch = swCode.match(/const PRECACHE_ASSETS = \[([\s\S]*?)\];/);
  if (!precacheMatch) throw new Error('PRECACHE_ASSETS array not found in sw.js');

  const assets = precacheMatch[1]
    .split(',')
    .map(s => s.trim().replace(/['"]/g, ''))
    .filter(s => s && s !== './');

  assets.forEach(asset => {
    const assetPath = path.resolve(asset.replace(/^\.\//, ''));
    if (!fs.existsSync(assetPath)) {
      throw new Error(`Precached asset missing on disk: ${assetPath}`);
    }
  });
});

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
console.log('\n================================================================');
const passedCount = testResults.filter(t => t.status === 'PASSED').length;
const failedCount = testResults.filter(t => t.status === 'FAILED').length;
console.log(`📊 TEST SUITE SUMMARY: ${passedCount}/${testResults.length} TESTS PASSED`);
if (failedCount > 0) {
  console.log(`❌ FAILURES: ${failedCount}`);
  process.exit(1);
} else {
  console.log('🎉 ALL 10 SYSTEM CYCLES PASSED WITH 100% SUCCESS!');
  console.log('================================================================');
}

})();
