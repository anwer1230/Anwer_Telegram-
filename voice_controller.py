# -*- coding: utf-8 -*-
"""
محرك التحكم الصوتي الذكي والشامل (Voice Autonomous Controller Engine)
يتيح قيادة وتشغيل التطبيق بالكامل صوتياً:
1. تسجيل الدخول بالاسم أو الرقم شفوياً
2. إدخال كود التحقق شفوياً (أرقام أو كلمات عربية منطوقة)
3. إدخال كلمة المرور (2FA) صوتياً
4. ضبط نوع الإرسال، الفواصل الزمنية، الجدولة، البدء، الحفظ، والإيقاف
5. المراقبة الذكية، الفحص، والتنقل بين أقسام التطبيق
يعمل المحرك بنظام مزدوج:
- مسار محلي فوري ودقيق (Regex / Rule-based)
- مسار ذكاء اصطناعي عبر Gemini Rotator لتفسير الجمل الحرة والمركبة
"""

import re
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("VoiceController")

# خريطة تحويل الكلمات الرقمية العربية إلى أرقام
ARABIC_NUMBER_WORDS = {
    "صفر": "0", "واحد": "1", "اثنين": "2", "إثنين": "2", "اثنان": "2", "إثنان": "2",
    "ثلاثة": "3", "تلاتة": "3", "اربعة": "4", "أربعة": "4",
    "خمسة": "5", "ستة": "6", "سبعة": "7", "ثمانية": "8", "تمانية": "8", "تسعة": "9",
    "عشرة": "10", "عشرين": "20", "ثلاثين": "30", "اربعين": "40", "أربعين": "40",
    "خمسين": "50", "ستين": "60", "سبعين": "70", "ثمانين": "80", "تسعين": "90"
}

def normalize_arabic(text: str) -> str:
    """تنظيف وتوحيد الحروف العربية لتسهيل الفهم والمطابقة"""
    if not text:
        return ""
    t = text.strip()
    t = re.sub(r'[\u064B-\u065F\u0670]', '', t)  # إزالة التشكيل
    t = re.sub(r'[إأآا]', 'ا', t)
    t = re.sub(r'[ى]', 'ي', t)
    t = re.sub(r'[ة]', 'ه', t)
    t = re.sub(r'[ؤئ]', 'ء', t)
    return t.lower()

def extract_spoken_code(text: str) -> Optional[str]:
    """استخراج كود التحقق سواء قيل كأرقام مجردة أو كلمات عربية منطوقة"""
    # البحث عن متتالية أرقام إنجليزية أو هندية
    num_match = re.search(r'\b\d{4,8}\b', text)
    if num_match:
        return num_match.group(0)
    
    # البحث عن أرقام مفصولة بمسافات: "4 8 2 1 9"
    space_digits = re.findall(r'\b\d\b', text)
    if len(space_digits) >= 4:
        return ''.join(space_digits)

    # البحث عن كلمات رقمية متتالية: "اربعه ثمانيه اثنين واحد تسعه"
    words = text.split()
    converted_digits = []
    for w in words:
        norm_w = normalize_arabic(w)
        for num_word, digit in ARABIC_NUMBER_WORDS.items():
            if normalize_arabic(num_word) == norm_w and len(digit) == 1:
                converted_digits.append(digit)
                break
    if len(converted_digits) >= 4:
        return ''.join(converted_digits)

    return None

def parse_voice_command(raw_text: str, user_id: str = "user_1") -> Dict[str, Any]:
    """
    تحليل الأمر الصوتي واستخراج النية التنفيذية (Intent) والمعاملات
    """
    if not raw_text:
        return {
            "success": False,
            "message": "لم يتم استلام أي نص صوتي",
            "spoken_feedback": "لم أسمع أي أمر، يرجى إعادة المحاولة."
        }

    raw = raw_text.strip()
    norm = normalize_arabic(raw)
    logger.info(f"🎤 تحليل أمر صوتي: '{raw}' (مُوحد: '{norm}')")

    # 1. كود التحقق (Verify Code)
    # أمثلة: "الكود هو 48219"، "ادخل الكود 12345"، "رمز التحقق اربعة ثمانية..."
    if any(k in norm for k in ["كود", "رمز التحقق", "الرمز"]) or re.search(r'\b\d{4,8}\b', raw):
        code = extract_spoken_code(raw)
        if code:
            return {
                "success": True,
                "action": "SUBMIT_CODE",
                "params": {"code": code},
                "spoken_feedback": f"تم إدخال كود التحقق {code} وجاري تسجيل الدخول."
            }

    # 2. كلمة المرور أو التحقق بخطوتين (2FA Password)
    # أمثلة: "كلمة المرور هي ...", "الباسورد ...", "رمز الحماية ..."
    pass_match = re.search(r'(?:كلم[ةه]\s*(?:المرور|السر)|باسورد|كلمة السر|رمز الحماي[ةه])\s*(?:هي|هو|:)?\s*(.+)', raw, re.IGNORECASE)
    if pass_match:
        pwd = pass_match.group(1).strip()
        if pwd:
            return {
                "success": True,
                "action": "SUBMIT_2FA",
                "params": {"password": pwd},
                "spoken_feedback": "تم إدخال كلمة المرور بنجاح وجاري إكمال التحقق."
            }

    # 3. تسجيل الدخول بحساب معين أو برقم هاتف (Login)
    # أمثلة: "سجل الدخول بحساب Lamis", "سجل بحساب لميس", "ادخل برقم 01120945094", "اختر حساب العمل"
    if any(k in norm for k in ["سجل الدخول", "سجل دخول", "ادخل بحساب", "اختر حساب", "سجل برقم", "تسجيل الدخول", "تسجيل برقم"]):
        # فحص وجود رقم هاتف دولي أو محلي
        phone_match = re.search(r'(\+?\d{9,15})', raw)
        phone = phone_match.group(1) if phone_match else None
        
        account_name = None
        if phone == "+201120945094":
            account_name = "Lamis"
        elif "لميس" in norm or "lamis" in raw.lower():
            account_name = "Lamis"
            phone = "+201120945094"
        elif not phone:
            # إذا لم يُذكر رقم هاتف، نفحص اسم الحساب المنطوق
            if "ثاني" in norm or "حساب 2" in norm:
                account_name = "الحساب الثاني"
                phone = "+573244867204"
            elif "ثالث" in norm or "حساب 3" in norm:
                account_name = "الحساب الثالث"
                phone = "+201221349790"
            elif "رابع" in norm or "حساب 4" in norm:
                account_name = "الحساب الرابع"
                phone = "+201148863243"
            elif "خامس" in norm or "حساب 5" in norm:
                account_name = "الحساب الخامس"
                phone = "+213797500921"
            elif "سادس" in norm or "حساب 6" in norm:
                account_name = "الحساب السادس"
                phone = "+201274386864"
            elif "سابع" in norm or "حساب 7" in norm:
                account_name = "الحساب السابع"
                phone = "+966539709737"
            else:
                name_extract = re.sub(r'^(سجل الدخول|سجل دخول|ادخل بحساب|اختر حساب|سجل برقم|تسجيل الدخول|بحساب)\s*', '', norm).strip()
                if name_extract:
                    account_name = name_extract

        return {
            "success": True,
            "action": "LOGIN",
            "params": {
                "account_name": account_name or "حساب محدد",
                "phone": phone
            },
            "spoken_feedback": f"جاري تسجيل الدخول بحساب {account_name or phone or 'المحدد'}. يرجى نطق كود التحقق فور وصوله."
        }

    # 4. بدء الإرسال الفوري (Send Now / Start Sending)
    # أمثلة: "ابدأ الإرسال", "شغل الإرسال", "ارسل الآن", "إرسال الآن", "انطلق"
    if any(k in norm for k in ["ابدا الارسال", "شغل الارسال", "ارسل الان", "ارسال الان", "انطلق", "ابدا ارسال"]):
        return {
            "success": True,
            "action": "SEND_NOW",
            "params": {},
            "spoken_feedback": "تم تشغيل الإرسال الفوري لجميع المجموعات المحددة."
        }

    # 5. إيقاف الإرسال (Stop Sending)
    # أمثلة: "أوقف الإرسال", "وقف الإرسال", "توقف", "إلغاء الإرسال"
    if any(k in norm for k in ["اوقف الارسال", "وقف الارسال", "توقف", "الغاء الارسال", "اوقف الارسال الان"]):
        return {
            "success": True,
            "action": "STOP_SEND",
            "params": {},
            "spoken_feedback": "تم إيقاف الإرسال بنجاح."
        }

    # 6. تشغيل المراقبة التلقائية الذكية (Start Monitoring)
    # أمثلة: "شغل المراقبة", "ابدأ المراقبة", "تفعيل المراقبة"
    if any(k in norm for k in ["شغل المراقبه", "ابدا المراقبه", "تفعيل المراقبه"]):
        return {
            "success": True,
            "action": "START_MONITORING",
            "params": {},
            "spoken_feedback": "تم تشغيل نظام المراقبة الذكية لرصد الكلمات والتنبيهات."
        }

    # 7. إيقاف المراقبة الذكية (Stop Monitoring)
    # أمثلة: "أوقف المراقبة", "وقف المراقبة", "تعطيل المراقبة"
    if any(k in norm for k in ["اوقف المراقبه", "وقف المراقبه", "تعطيل المراقبه"]):
        return {
            "success": True,
            "action": "STOP_MONITORING",
            "params": {},
            "spoken_feedback": "تم إيقاف المراقبة الذكية."
        }

    # 8. حفظ الإعدادات (Save Settings)
    # أمثلة: "احفظ الإعدادات", "حفظ الإعدادات", "تثبيت الإعدادات"
    if any(k in norm for k in ["احفظ الاعدادات", "حفظ الاعدادات", "تثبيت الاعدادات", "احفظ"]):
        return {
            "success": True,
            "action": "SAVE_SETTINGS",
            "params": {},
            "spoken_feedback": "تم حفظ جميع الإعدادات الحالية بنجاح."
        }

    # 9. ضبط الفاصل الزمني (Set Interval)
    # أمثلة: "اجعل الفاصل الزمني 10 دقائق", "الفاصل 25 دقيقة", "ارسل كل 5 دقائق"
    interval_match = re.search(r'(?:فاصل|فتره|كل|مده)?\s*(?:الارسال|الزمني)?\s*(\d+)\s*(?:دقيقه|دقايق|ثانيه)?', norm)
    if interval_match and any(w in norm for w in ["دقيقه", "دقايق", "فاصل", "الزمني"]):
        minutes = int(interval_match.group(1))
        return {
            "success": True,
            "action": "SET_INTERVAL",
            "params": {"minutes": minutes},
            "spoken_feedback": f"تم ضبط فاصل الإرسال إلى {minutes} دقيقة."
        }

    # 10. ضبط الجدولة الدائرية (Set Schedule Duration & Pause)
    # أمثلة: "مدة التشغيل 3 ساعات والتوقف ساعتين", "شغل 4 ساعات واسترح ساعتين"
    sched_match = re.search(r'(\d+(?:\.\d+)?)\s*ساع(?:ه|ات).*?(\d+(?:\.\d+)?)\s*ساع(?:ه|ات)', norm)
    if sched_match:
        dur = float(sched_match.group(1))
        pause = float(sched_match.group(2))
        return {
            "success": True,
            "action": "SET_SCHEDULE",
            "params": {"duration_hours": dur, "pause_hours": pause},
            "spoken_feedback": f"تم ضبط الجدولة: تشغيل لمدة {dur} ساعات، ثم توقف لمدة {pause} ساعات دورياً."
        }

    # 11. نوع الإرسال (Set Send Type)
    # أمثلة: "نوع الإرسال مجدول", "نوع الإرسال يدوي"
    if "مجدول" in norm:
        return {
            "success": True,
            "action": "SET_SEND_TYPE",
            "params": {"send_type": "scheduled"},
            "spoken_feedback": "تم تحويل نوع الإرسال إلى مجدول."
        }
    elif "يدوي" in norm:
        return {
            "success": True,
            "action": "SET_SEND_TYPE",
            "params": {"send_type": "manual"},
            "spoken_feedback": "تم تحويل نوع الإرسال إلى يدوي."
        }

    # 12. وضع الإرسال عند المجموعات المحمية (Sanitize Mode)
    # أمثلة: "وضع السلام", "وضع ذكي", "وضع تخطي", "وضع تنقية"
    if "سلام" in norm or "salam" in raw.lower():
        return {
            "success": True,
            "action": "SET_SANITIZE_MODE",
            "params": {"mode": "salam"},
            "spoken_feedback": "تم تفعيل الوضع الذكي: السلام عليكم مع التعديل التلقائي."
        }
    elif "تخطي" in norm:
        return {
            "success": True,
            "action": "SET_SANITIZE_MODE",
            "params": {"mode": "skip"},
            "spoken_feedback": "تم تفعيل وضع التخطي للمجموعات المحمية."
        }
    elif "تنقيه" in norm:
        return {
            "success": True,
            "action": "SET_SANITIZE_MODE",
            "params": {"mode": "always"},
            "spoken_feedback": "تم تفعيل وضع التنقية الدائم وحذف الروابط."
        }

    # 13. فحص واستعلام حالة الحساب (Check Status)
    # أمثلة: "ما هي حالة الحساب", "هل الحساب متصل", "حالة الاتصال", "فحص الحساب"
    if any(k in norm for k in ["حاله الحساب", "حاله الاتصال", "هل الحساب متصل", "فحص الحساب", "الحاله"]):
        return {
            "success": True,
            "action": "CHECK_STATUS",
            "params": {},
            "spoken_feedback": "جاري فحص حالة الحساب وعرض تفاصيل الاتصال."
        }

    # 14. التنقل بين أقسام التطبيق (Navigation)
    # أمثلة: "افتح رادار الروابط", "افتح محول الوورد", "افتح محلل المستندات", "افتح الإحصائيات"
    if "رادار" in norm:
        return {
            "success": True,
            "action": "NAVIGATE",
            "params": {"url": "/link_radar"},
            "spoken_feedback": "تم فتح رادار الروابط التلقائي."
        }
    elif any(k in norm for k in ["وورد", "منسق", "مستندات وورد", "ملفات وورد"]) or bool(re.search(r'\bword\b', raw.lower())):
        return {
            "success": True,
            "action": "NAVIGATE",
            "params": {"url": "/html_to_word"},
            "spoken_feedback": "تم فتح استوديو تحويل وتنسيق مستندات Word."
        }
    elif "محلل" in norm or "مستندات" in norm or "وثايق" in norm:
        return {
            "success": True,
            "action": "NAVIGATE",
            "params": {"url": "/ai_doc_analyzer"},
            "spoken_feedback": "تم فتح المحلل الذكي للمستندات والصور."
        }
    elif "احصايء" in norm or "احصاء" in norm:
        return {
            "success": True,
            "action": "NAVIGATE",
            "params": {"url": "/stats1208"},
            "spoken_feedback": "تم فتح لوحة التحليل الإحصائي."
        }
    elif "روابط محفوظه" in norm or "الروابط المحفوظه" in norm:
        return {
            "success": True,
            "action": "NAVIGATE",
            "params": {"url": "/saved_links"},
            "spoken_feedback": "تم فتح قائمة الروابط المحفوظة."
        }

    # مسار الذكاء الاصطناعي المساند عبر Gemini في حال كانت الجملة مركبة وغير نمطية
    try:
        from gemini_rotator import get_rotator
        rotator = get_rotator()
        ai_prompt = f"""أنت مفسر أوامر صوتية لتطبيق أتمتة تيليجرام.
حلل الجملة المنطوقة التالية واستخرج الأمر التنفيذي:
الجملة: "{raw}"

اختر الإجراء من القائمة التالية فقط:
- LOGIN (مع بارامتر phone أو account_name)
- SUBMIT_CODE (مع بارامتر code)
- SUBMIT_2FA (مع بارامتر password)
- SEND_NOW (بدء الإرسال)
- STOP_SEND (إيقاف الإرسال)
- SAVE_SETTINGS (حفظ الإعدادات)
- START_MONITORING (تشغيل المراقبة)
- STOP_MONITORING (إيقاف المراقبة)
- SET_INTERVAL (مع بارامتر minutes)
- CHECK_STATUS (فحص الحالة)
- NAVIGATE (مع بارامتر url)
- UNKNOWN (غير معروف)

أجب بكائن JSON صالح فقط بالشكل التالي دون أي نصوص إضافية:
{{"action": "...", "params": {{}}, "spoken_feedback": "عبارة تأكيدية باللغة العربية لنطقها للمستخدم"}}
"""
        response = rotator.generate_content(ai_prompt, generation_config={"response_mime_type": "application/json"})
        if response and response.text:
            parsed = json.loads(response.text.strip())
            action = parsed.get("action", "UNKNOWN")
            if action != "UNKNOWN":
                return {
                    "success": True,
                    "action": action,
                    "params": parsed.get("params", {}),
                    "spoken_feedback": parsed.get("spoken_feedback", f"تم تنفيذ الأمر: {action}")
                }
    except Exception as e:
        logger.debug(f"Gemini fallback voice parsing skipped: {e}")

    return {
        "success": False,
        "action": "UNKNOWN",
        "message": f"لم يتم التعرف على أمر مطابق: '{raw}'",
        "spoken_feedback": f"عذراً، لم أتعرف على الأمر '{raw}'. يمكنك قول: ابدأ الإرسال، أو سجل الدخول بحساب لميس، أو احفظ الإعدادات."
    }
