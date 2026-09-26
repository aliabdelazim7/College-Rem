/**
 * ====================================================================
 * جدول سكشن 6 - نظام المزامنة مع جوجل شيت (Google Apps Script Backend)
 * ====================================================================
 * 
 * طريقة التركيب والتشغيل في 3 خطوات بسيطة:
 * 1. افتح جدول بيانات جوجل جديد (Google Sheets).
 * 2. من القائمة العلوية اضغط: الإضافات (Extensions) -> Apps Script.
 * 3. امسح أي كود موجود في المحرر والصق هذا الكود بالكامل، ثم اضغط حفظ (Ctrl + S).
 * 4. اضغط على نشر (Deploy) -> نشر جديد (New deployment):
 *    - نوع النشر: تطبيق ويب (Web app).
 *    - الوصف: سكشن 6 Backend.
 *    - تنفيذ باسم: حسابي (Me).
 *    - من يمكنه الوصول: أي شخص (Anyone) - حتى يتمكن تطبيقك من المزامنة بحرية.
 * 5. اضغط نشر (Deploy) وانسخ رابط تطبيق الويب (Web App URL)، ثم الصقه في نافذة المزامنة بالتطبيق!
 * ====================================================================
 */

// أسماء أوراق العمل
const SHEET_ATTENDANCE = "الحضور_والغياب";
const SHEET_TASKS = "التكليفات_والشيتات";
const SHEET_SETTINGS = "الإعدادات_والبيانات";

/**
 * دالة التعامل مع طلبات GET (لجلب البيانات أو الفحص)
 */
function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action ? e.parameter.action : "getData";
    
    if (action === "getData") {
      const data = getAllDataFromSheets();
      return jsonResponse({ status: "success", data: data });
    }
    
    return jsonResponse({
      status: "online",
      message: "تم تشغيل سيرفر سكشن 6 بنجاح! السيرفر متصل بجوجل شيت وجاهز لاستقبال البيانات.",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse({ status: "error", message: error.toString() });
  }
}

/**
 * دالة التعامل مع طلبات POST (لحفظ وتحديث وتصفير البيانات)
 */
function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter && e.parameter.payload) {
      payload = JSON.parse(e.parameter.payload);
    }
    
    const action = payload.action || "syncAll";
    
    if (action === "syncAll") {
      // مزامنة وحفظ كافة البيانات
      syncAllToSheets(payload.data || {});
      return jsonResponse({
        status: "success",
        message: "تمت المزامنة وحفظ البيانات بنجاح في جوجل شيت!",
        timestamp: new Date().toISOString()
      });
    } else if (action === "clearAll") {
      // تصفير قاعدة البيانات
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
 * تجهيز الرد كـ JSON
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * التأكد من وجود وتنسيق الشيتات المطلوبة
 */
function ensureSheetsSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. شيت الحضور والغياب
  let sheetAtt = ss.getSheetByName(SHEET_ATTENDANCE);
  if (!sheetAtt) {
    sheetAtt = ss.insertSheet(SHEET_ATTENDANCE);
    const headers = [["ID_الحصة", "المادة", "نوع_الحصة", "اليوم", "الفترة", "القاعة", "المحاضر/المعيد", "حالة_الحضور", "تاريخ_التسجيل"]];
    sheetAtt.getRange(1, 1, 1, headers[0].length).setValues(headers)
      .setFontWeight("bold")
      .setBackground("#3B7A57")
      .setFontColor("#FFFFFF");
    sheetAtt.setFrozenRows(1);
  }
  
  // 2. شيت التكليفات والشيتات
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
  
  // 3. شيت الإعدادات
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
  
  return { ss, sheetAtt, sheetTasks, sheetSettings };
}

/**
 * مزامنة كاملة للبيانات وحفظها في الشيتات
 */
function syncAllToSheets(data) {
  const { sheetAtt, sheetTasks, sheetSettings } = ensureSheetsSetup();
  const nowStr = new Date().toLocaleString("ar-EG");

  // 1. حفظ الحضور والغياب
  if (data.attendance) {
    // مسح السجلات القديمة مع الإبقاء على الهيدر
    const lastRow = sheetAtt.getLastRow();
    if (lastRow > 1) {
      sheetAtt.getRange(2, 1, lastRow - 1, sheetAtt.getLastColumn()).clearContent();
    }
    
    const rows = [];
    const attMap = data.attendance || {};
    for (let classId in attMap) {
      const status = attMap[classId];
      rows.push([
        classId,
        data.meta && data.meta[classId] ? data.meta[classId].subject : "",
        data.meta && data.meta[classId] ? data.meta[classId].typeLabel : "",
        data.meta && data.meta[classId] ? data.meta[classId].day : "",
        data.meta && data.meta[classId] ? data.meta[classId].period : "",
        data.meta && data.meta[classId] ? data.meta[classId].room : "",
        data.meta && data.meta[classId] ? data.meta[classId].doctor : "",
        status === "present" ? "حاضر ✓" : (status === "absent" ? "غائب ✕" : "ملغاة"),
        nowStr
      ]);
    }
    
    if (rows.length > 0) {
      sheetAtt.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    }
  }

  // 2. حفظ التكليفات والشيتات
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

  // 3. حفظ الإعدادات والـ Streak
  const settingsRows = [
    ["streakCount", (data.streak || 0).toString(), nowStr],
    ["periodTimes", JSON.stringify(data.periodTimes || {}), nowStr],
    ["lastSync", nowStr, nowStr]
  ];
  sheetSettings.getRange(2, 1, settingsRows.length, 3).setValues(settingsRows);
}

/**
 * جلب كافة البيانات المخزنة من الشيت
 */
function getAllDataFromSheets() {
  const { sheetAtt, sheetTasks, sheetSettings } = ensureSheetsSetup();
  
  // 1. جلب الحضور
  const attendance = {};
  const lastAttRow = sheetAtt.getLastRow();
  if (lastAttRow > 1) {
    const attValues = sheetAtt.getRange(2, 1, lastAttRow - 1, 8).getValues();
    attValues.forEach(row => {
      const id = row[0];
      const statusText = row[7];
      if (id && statusText) {
        if (statusText.includes("حاضر")) attendance[id] = "present";
        else if (statusText.includes("غائب")) attendance[id] = "absent";
        else if (statusText.includes("ملغاة")) attendance[id] = "excused";
      }
    });
  }
  
  // 2. جلب التكليفات
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
  
  // 3. جلب الـ Streak والإعدادات
  let streak = 0;
  let periodTimes = null;
  const lastSetRow = sheetSettings.getLastRow();
  if (lastSetRow > 1) {
    const setValues = sheetSettings.getRange(2, 1, lastSetRow - 1, 2).getValues();
    setValues.forEach(row => {
      if (row[0] === "streakCount") streak = parseInt(row[1] || "0", 10);
      if (row[0] === "periodTimes" && row[1]) {
        try { periodTimes = JSON.parse(row[1]); } catch(e) {}
      }
    });
  }
  
  return {
    attendance: attendance,
    tasks: tasks,
    streak: streak,
    periodTimes: periodTimes
  };
}

/**
 * تصفير كافة أوراق العمل لإعادة البدء من الصفر
 */
function clearAllSheetsData() {
  const { sheetAtt, sheetTasks, sheetSettings } = ensureSheetsSetup();
  
  if (sheetAtt.getLastRow() > 1) {
    sheetAtt.getRange(2, 1, sheetAtt.getLastRow() - 1, sheetAtt.getLastColumn()).clearContent();
  }
  if (sheetTasks.getLastRow() > 1) {
    sheetTasks.getRange(2, 1, sheetTasks.getLastRow() - 1, sheetTasks.getLastColumn()).clearContent();
  }
  if (sheetSettings.getLastRow() > 1) {
    sheetSettings.getRange(2, 1, sheetSettings.getLastRow() - 1, sheetSettings.getLastColumn()).clearContent();
  }
  
  // تسجيل الحالة الافتراضية
  const nowStr = new Date().toLocaleString("ar-EG");
  const settingsRows = [
    ["streakCount", "0", nowStr],
    ["periodTimes", "{}", nowStr],
    ["lastSync", nowStr, nowStr]
  ];
  sheetSettings.getRange(2, 1, settingsRows.length, 3).setValues(settingsRows);
}
