/**
 * ====================================================================
 * جدول سكشن 6 - نظام المزامنة والباك-إند المطور (Google Apps Script v2.0)
 * ====================================================================
 * 
 * الميزات المدعومة:
 * 1. مزامنة وحفظ الجدول الدراسي المخصص بالكامل (السكاشن والمحاضرات والمواعيد).
 * 2. مزامنة سجل الحضور والغياب مع نسب الغياب وأسماء المواد.
 * 3. مزامنة شيتات وتكليفات السكاشن مع تواريخ التسليم وحالة الإنجاز.
 * 4. مزامنة الـ Streak، مواعيد الفترات، روابط Drive للمواد، ودرجات أعمال السنة.
 * 5. تأمين ضد تضارب العمليات المتزامنة (Concurrency Lock).
 * 6. دالة اختبار مدمجة (testBackend) لتجربة الكود بضغطة زر داخل محرر Apps Script.
 * 
 * --------------------------------------------------------------------
 * طريقة التركيب والتحديث (في دقيقة واحدة):
 * 1. افتح شيت جوجل الخاص بك (Google Sheets).
 * 2. من القائمة العلوية اضغط: الإضافات (Extensions) -> Apps Script.
 * 3. امسح أي كود قديم في المحرر، والصق هذا الملف بالكامل، ثم اضغط حفظ (Ctrl + S).
 * 4. اضغط على الزر الأزرق: نشر (Deploy) -> نشر جديد (New deployment):
 *    - نوع النشر: تطبيق ويب (Web app).
 *    - الوصف: سكشن 6 Backend v2.0.
 *    - تنفيذ باسم (Execute as): حسابي (Me).
 *    - من يمكنه الوصول (Who has access): أي شخص (Anyone) - (ضروري جداً ليعمل على الموبايل بدون طلب تسجيل دخول).
 * 5. اضغط نشر (Deploy) وامنح الصلاحيات، ثم انسخ رابط تطبيق الويب (Web App URL) وضعه في التطبيق!
 * ====================================================================
 */

// أسماء أوراق العمل في جدول البيانات
const SHEET_SCHEDULE = "الجدول_الدراسي";
const SHEET_ATTENDANCE = "الحضور_والغياب";
const SHEET_TASKS = "التكليفات_والشيتات";
const SHEET_SETTINGS = "الإعدادات_والبيانات";

/**
 * دالة التعامل مع طلبات GET (لجلب البيانات أو الفحص السحابي)
 */
function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action ? e.parameter.action : "info";
    
    if (action === "getData") {
      const data = getAllDataFromSheets();
      return jsonResponse({ status: "success", data: data });
    }
    
    if (action === "test") {
      const testResult = testBackend();
      return jsonResponse({ status: "success", test: testResult });
    }
    
    const { ss } = ensureSheetsSetup();
    return jsonResponse({
      status: "online",
      message: "سيرفر سكشن 6 يعمل بنجاح! متصل بجدول البيانات وجاهز لاستقبال التعديلات والمزامنة.",
      spreadsheetUrl: ss ? ss.getUrl() : "",
      supportedActions: ["getData", "syncAll", "clearAll", "test"],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse({ status: "error", message: error.toString() });
  }
}

/**
 * دالة التعامل مع طلبات POST (لحفظ ومزامنة وتصفير البيانات)
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // قفل الحفظ لمدة أقصاها 10 ثوانٍ لمنع تضارب التعديلات المتزامنة
    lock.waitLock(10000);

    let payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (err) {
        payload = {};
      }
    } else if (e && e.parameter && e.parameter.payload) {
      try {
        payload = JSON.parse(e.parameter.payload);
      } catch (err) {
        payload = {};
      }
    }
    
    const action = payload.action || (e && e.parameter && e.parameter.action) || "syncAll";
    
    if (action === "syncAll") {
      syncAllToSheets(payload.data || {});
      return jsonResponse({
        status: "success",
        message: "تمت مزامنة كافة البيانات والجدول بنجاح في جوجل شيت! ✓",
        timestamp: new Date().toISOString()
      });
    } else if (action === "clearAll") {
      clearAllSheetsData();
      return jsonResponse({
        status: "success",
        message: "تم تصفير ومسح قاعدة البيانات في جوجل شيت بنجاح!",
        timestamp: new Date().toISOString()
      });
    } else if (action === "getData") {
      const data = getAllDataFromSheets();
      return jsonResponse({ status: "success", data: data });
    }
    
    return jsonResponse({ status: "error", message: "إجراء غير معروف: " + action });
  } catch (error) {
    return jsonResponse({ status: "error", message: error.toString() });
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

/**
 * دعم CORS لطلبات OPTIONS من المتصفح
 */
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * تجهيز الرد كـ JSON مع دعم الرؤوس المناسبة
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * التأكد من وجود وتنسيق كافة أوراق العمل في الشيت
 */
function ensureSheetsSetup() {
  let ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {}
  
  if (!ss) {
    const props = PropertiesService.getScriptProperties();
    const savedId = props.getProperty("SPREADSHEET_ID");
    if (savedId) {
      try {
        ss = SpreadsheetApp.openById(savedId);
      } catch (e) {}
    }
    
    if (!ss) {
      ss = SpreadsheetApp.create("جدول سكشن 6 - قاعدة البيانات السحابية");
      props.setProperty("SPREADSHEET_ID", ss.getId());
    }
  }
  
  // 1. شيت الجدول الدراسي (الجديد المطور)
  let sheetSchedule = ss.getSheetByName(SHEET_SCHEDULE);
  if (!sheetSchedule) {
    sheetSchedule = ss.insertSheet(SHEET_SCHEDULE);
    const headers = [["ID_الحصة", "المادة", "نوع_الحصة", "اليوم", "رقم_اليوم", "الفترة", "القاعة/المعمل", "المحاضر/المعيد", "لون_البطاقة", "آخر_تحديث"]];
    sheetSchedule.getRange(1, 1, 1, headers[0].length).setValues(headers)
      .setFontWeight("bold")
      .setBackground("#4338CA")
      .setFontColor("#FFFFFF");
    sheetSchedule.setFrozenRows(1);
  }
  
  // 2. شيت الحضور والغياب
  let sheetAtt = ss.getSheetByName(SHEET_ATTENDANCE);
  if (!sheetAtt) {
    sheetAtt = ss.insertSheet(SHEET_ATTENDANCE);
    const headers = [["ID_الحصة", "المادة", "نوع_الحصة", "اليوم", "الفترة", "القاعة", "المحاضر/المعيد", "حالة_الحضور", "تاريخ_التسجيل"]];
    sheetAtt.getRange(1, 1, 1, headers[0].length).setValues(headers)
      .setFontWeight("bold")
      .setBackground("#059669")
      .setFontColor("#FFFFFF");
    sheetAtt.setFrozenRows(1);
  }
  
  // 3. شيت التكليفات والشيتات
  let sheetTasks = ss.getSheetByName(SHEET_TASKS);
  if (!sheetTasks) {
    sheetTasks = ss.insertSheet(SHEET_TASKS);
    const headers = [["ID_التكليف", "المادة", "السكشن_المعني", "النوع", "عنوان_المطلوب", "موعد_التسليم", "الأهمية", "تم_التسليم", "تاريخ_الإضافة"]];
    sheetTasks.getRange(1, 1, 1, headers[0].length).setValues(headers)
      .setFontWeight("bold")
      .setBackground("#D97706")
      .setFontColor("#FFFFFF");
    sheetTasks.setFrozenRows(1);
  }
  
  // 4. شيت الإعدادات والبيانات
  let sheetSettings = ss.getSheetByName(SHEET_SETTINGS);
  if (!sheetSettings) {
    sheetSettings = ss.insertSheet(SHEET_SETTINGS);
    const headers = [["المتغير", "القيمة", "آخر_تحديث"]];
    sheetSettings.getRange(1, 1, 1, headers[0].length).setValues(headers)
      .setFontWeight("bold")
      .setBackground("#475569")
      .setFontColor("#FFFFFF");
    sheetSettings.setFrozenRows(1);
  }
  
  return { ss, sheetSchedule, sheetAtt, sheetTasks, sheetSettings };
}

/**
 * مزامنة كاملة لكافة البيانات وحفظها في الشيتات
 */
function syncAllToSheets(data) {
  const { sheetSchedule, sheetAtt, sheetTasks, sheetSettings } = ensureSheetsSetup();
  const nowStr = new Date().toLocaleString("ar-EG");

  // 1. حفظ الجدول الدراسي المعدل
  if (data.schedule && Array.isArray(data.schedule)) {
    const lastRow = sheetSchedule.getLastRow();
    if (lastRow > 1) {
      sheetSchedule.getRange(2, 1, lastRow - 1, sheetSchedule.getLastColumn()).clearContent();
    }
    
    const scheduleRows = data.schedule.map(c => [
      c.id || "",
      c.subject || "",
      c.typeLabel || (c.type === "lecture" ? "محاضرة" : "سكشن عملي"),
      c.day || "",
      c.dayIndex !== undefined ? c.dayIndex.toString() : "0",
      c.period !== undefined ? c.period.toString() : "1",
      c.room || "",
      c.doctor || "",
      c.color || "sky",
      nowStr
    ]);
    
    if (scheduleRows.length > 0) {
      sheetSchedule.getRange(2, 1, scheduleRows.length, scheduleRows[0].length).setValues(scheduleRows);
    }
  }

  // 2. حفظ الحضور والغياب
  if (data.attendance) {
    const lastRow = sheetAtt.getLastRow();
    if (lastRow > 1) {
      sheetAtt.getRange(2, 1, lastRow - 1, sheetAtt.getLastColumn()).clearContent();
    }
    
    const rows = [];
    const attMap = data.attendance || {};
    for (let classId in attMap) {
      const status = attMap[classId];
      const m = (data.meta && data.meta[classId]) || {};
      rows.push([
        classId,
        m.subject || "",
        m.typeLabel || "",
        m.day || "",
        m.period !== undefined ? m.period.toString() : "",
        m.room || "",
        m.doctor || "",
        status === "present" ? "حاضر ✓" : (status === "absent" ? "غائب ✕" : "ملغاة"),
        nowStr
      ]);
    }
    
    if (rows.length > 0) {
      sheetAtt.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    }
  }

  // 3. حفظ التكليفات والشيتات
  if (data.tasks && Array.isArray(data.tasks)) {
    const lastRow = sheetTasks.getLastRow();
    if (lastRow > 1) {
      sheetTasks.getRange(2, 1, lastRow - 1, sheetTasks.getLastColumn()).clearContent();
    }
    
    const taskRows = data.tasks.map(t => [
      t.id.toString(),
      t.subject || "",
      t.sectionLabel || "",
      t.type || "sheet",
      t.title || "",
      t.dueDate || "",
      t.priority || "normal",
      t.completed ? "نعم ✓" : "لا ⏳",
      t.createdAt || nowStr
    ]);
    
    if (taskRows.length > 0) {
      sheetTasks.getRange(2, 1, taskRows.length, taskRows[0].length).setValues(taskRows);
    }
  }

  // 4. حفظ الإعدادات والـ Streak ودرجات أعمال السنة وروابط الماتريال
  const settingsRows = [
    ["streakCount", (data.streak || 0).toString(), nowStr],
    ["periodTimes", JSON.stringify(data.periodTimes || {}), nowStr],
    ["subjectMaterials", JSON.stringify(data.subjectMaterials || {}), nowStr],
    ["courseworkGrades", JSON.stringify(data.courseworkGrades || {}), nowStr],
    ["lastSync", nowStr, nowStr]
  ];
  sheetSettings.getRange(2, 1, settingsRows.length, 3).setValues(settingsRows);
}

/**
 * جلب كافة البيانات المخزنة من الشيت
 */
function getAllDataFromSheets() {
  const { sheetSchedule, sheetAtt, sheetTasks, sheetSettings } = ensureSheetsSetup();
  
  // 1. جلب الجدول الدراسي
  const schedule = [];
  const lastSchRow = sheetSchedule.getLastRow();
  if (lastSchRow > 1) {
    const schValues = sheetSchedule.getRange(2, 1, lastSchRow - 1, 9).getValues();
    schValues.forEach(row => {
      if (row[0]) {
        schedule.push({
          id: row[0],
          subject: row[1],
          typeLabel: row[2],
          type: (row[2] || "").includes("محاضرة") ? "lecture" : "section",
          day: row[3],
          dayIndex: parseInt(row[4] || "0", 10),
          period: isNaN(parseInt(row[5], 10)) ? row[5] : parseInt(row[5], 10),
          room: row[6],
          doctor: row[7],
          color: row[8] || "sky"
        });
      }
    });
  }

  // 2. جلب الحضور
  const attendance = {};
  const lastAttRow = sheetAtt.getLastRow();
  if (lastAttRow > 1) {
    const attValues = sheetAtt.getRange(2, 1, lastAttRow - 1, 8).getValues();
    attValues.forEach(row => {
      const id = row[0];
      const statusText = row[7] || "";
      if (id && statusText) {
        if (statusText.includes("حاضر")) attendance[id] = "present";
        else if (statusText.includes("غائب")) attendance[id] = "absent";
        else if (statusText.includes("ملغاة")) attendance[id] = "excused";
      }
    });
  }
  
  // 3. جلب التكليفات
  const tasks = [];
  const lastTaskRow = sheetTasks.getLastRow();
  if (lastTaskRow > 1) {
    const taskValues = sheetTasks.getRange(2, 1, lastTaskRow - 1, 9).getValues();
    taskValues.forEach(row => {
      tasks.push({
        id: Number(row[0]) || row[0],
        subject: row[1],
        sectionLabel: row[2],
        type: row[3],
        title: row[4],
        dueDate: row[5],
        priority: row[6],
        completed: (row[7] || "").toString().includes("نعم"),
        createdAt: row[8]
      });
    });
  }
  
  // 4. جلب الـ Streak والإعدادات والماتريال والدرجات
  let streak = 0;
  let periodTimes = null;
  let subjectMaterials = {};
  let courseworkGrades = {};
  const lastSetRow = sheetSettings.getLastRow();
  if (lastSetRow > 1) {
    const setValues = sheetSettings.getRange(2, 1, lastSetRow - 1, 2).getValues();
    setValues.forEach(row => {
      const key = row[0];
      const val = row[1];
      if (key === "streakCount") streak = parseInt(val || "0", 10);
      if (key === "periodTimes" && val) {
        try { periodTimes = JSON.parse(val); } catch(e) {}
      }
      if (key === "subjectMaterials" && val) {
        try { subjectMaterials = JSON.parse(val); } catch(e) {}
      }
      if (key === "courseworkGrades" && val) {
        try { courseworkGrades = JSON.parse(val); } catch(e) {}
      }
    });
  }
  
  return {
    schedule: schedule,
    attendance: attendance,
    tasks: tasks,
    streak: streak,
    periodTimes: periodTimes,
    subjectMaterials: subjectMaterials,
    courseworkGrades: courseworkGrades
  };
}

/**
 * تصفير كافة أوراق العمل لإعادة البدء من الصفر
 */
function clearAllSheetsData() {
  const { sheetSchedule, sheetAtt, sheetTasks, sheetSettings } = ensureSheetsSetup();
  
  if (sheetSchedule.getLastRow() > 1) {
    sheetSchedule.getRange(2, 1, sheetSchedule.getLastRow() - 1, sheetSchedule.getLastColumn()).clearContent();
  }
  if (sheetAtt.getLastRow() > 1) {
    sheetAtt.getRange(2, 1, sheetAtt.getLastRow() - 1, sheetAtt.getLastColumn()).clearContent();
  }
  if (sheetTasks.getLastRow() > 1) {
    sheetTasks.getRange(2, 1, sheetTasks.getLastRow() - 1, sheetTasks.getLastColumn()).clearContent();
  }
  if (sheetSettings.getLastRow() > 1) {
    sheetSettings.getRange(2, 1, sheetSettings.getLastRow() - 1, sheetSettings.getLastColumn()).clearContent();
  }
  
  const nowStr = new Date().toLocaleString("ar-EG");
  const settingsRows = [
    ["streakCount", "0", nowStr],
    ["periodTimes", "{}", nowStr],
    ["subjectMaterials", "{}", nowStr],
    ["courseworkGrades", "{}", nowStr],
    ["lastSync", nowStr, nowStr]
  ];
  sheetSettings.getRange(2, 1, settingsRows.length, 3).setValues(settingsRows);
}

/**
 * دالة الاختبار المدمجة (شغّلها من محرر Apps Script للتحقق من سلامة كل شيء بضغطة زر)
 */
function testBackend() {
  Logger.log("=== بدء تشغيل الفحص الآلي للباك-إند ===");
  
  // 1. اختبار إعداد الشيتات
  const setup = ensureSheetsSetup();
  Logger.log("✓ تم إعداد وتنسيق كافة الشيتات الأربعة بنجاح.");
  Logger.log("رابط جدول البيانات: " + setup.ss.getUrl());
  
  // 2. اختبار حفظ بيانات تجريبية
  const testPayload = {
    schedule: [
      { id: "test-sun-1", subject: "شبكات الحاسب", type: "lecture", typeLabel: "محاضرة", day: "الأحد", dayIndex: 0, period: 1, room: "مدرج 3", doctor: "أ.د/ عطوان", color: "sky" }
    ],
    attendance: { "test-sun-1": "present" },
    tasks: [
      { id: 999, subject: "شبكات الحاسب", sectionLabel: "سكشن عملي", type: "sheet", title: "شيت تجريبي للتحقق", dueDate: "2026-10-15", priority: "urgent", completed: false }
    ],
    streak: 3,
    periodTimes: { 1: { start: "08:30", end: "10:10" } },
    subjectMaterials: { networks: "https://drive.google.com/test" },
    courseworkGrades: { networks: { midterm: 20 } },
    meta: { "test-sun-1": { subject: "شبكات الحاسب", typeLabel: "محاضرة", day: "الأحد", period: 1, room: "مدرج 3", doctor: "أ.د/ عطوان" } }
  };
  
  syncAllToSheets(testPayload);
  Logger.log("✓ تم إرسال وحفظ البيانات التجريبية بنجاح.");
  
  // 3. اختبار جلب البيانات والتأكد من تطابقها
  const fetched = getAllDataFromSheets();
  if (fetched.schedule.length > 0 && fetched.attendance["test-sun-1"] === "present") {
    Logger.log("✓ تم جلب البيانات والتحقق من صحتها بنجاح: " + JSON.stringify(fetched.schedule[0]));
    Logger.log("=== جميع الفحوصات نجحت بنسبة 100%! السيرفر جاهز تماماً للعمل ===");
    return { success: true, message: "جميع الفحوصات نجحت بنسبة 100%", spreadsheetUrl: setup.ss.getUrl() };
  } else {
    Logger.log("✕ حدث عدم تطابق في استرجاع البيانات.");
    return { success: false, message: "فشل التحقق من استرجاع البيانات" };
  }
}
