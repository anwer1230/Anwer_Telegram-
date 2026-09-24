# Anwer Telegram Services (نظام إدارة ومراقبة حسابات تيليجرام)

تطبيق متقدم لإدارة ومراقبة حسابات وقنوات ومجموعات تيليجرام مع واجهة مستخدم احترافية وتصميم مطابق لتطبيق تيليجرام الرسمي.

## 🚀 المميزات الرئيسية
- 👥 **شريط جانبي متطور للحسابات**: تصميم مطابق لتطبيق تيليجرام الرسمي للتنقل بين الحسابات وإضافة حسابات جديدة بسهولة.
- 📡 **مراقبة التوجيه التلقائي (Forwarding)**: مراقبة وتوجيه الرسائل بين القنوات والمجموعات في الوقت الفعلي.
- ⚡ **لوحة تحكم تفاعلية**: إحصائيات، سجلات النشاط، وإدارة فورية للاتصال.
- 🛡️ **نظام أمان متكامل**: إدارة الجلسات ومفاتيح Telethon بأمان.

---

## 🌐 خطوات النشر السريع على Render (Render Deployment)

### الطريقة الأولى: النشر التلقائي عبر Render Blueprint (موصى به)
1. قم بتسجيل الدخول إلى [Render Dashboard](https://dashboard.render.com/).
2. اضغط على **New +** ثم اختر **Blueprint**.
3. اربط مستودع GitHub: `https://github.com/anwer1230/Anwer_Telegram-`
4. حدد الفرع (Branch): `render-deploy`
5. سيتعرف Render تلقائياً على ملف `render.yaml` ويبدأ البناء والتشغيل فوراً.

### الطريقة الثانية: النشر اليدوي (Manual Web Service)
1. في لوحة تحكم Render، اضغط على **New +** ثم اختر **Web Service**.
2. اختر المستودع: `Anwer_Telegram-`.
3. اضبط الإعدادات التالية:
   - **Name**: `anwer-telegram` (أو أي اسم تفضله)
   - **Branch**: `render-deploy`
   - **Language / Environment**: `Python 3`
   - **Region**: `Frankfurt (EU)` أو الأقرب إليك
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python main.py`
4. في قسم **Environment Variables**، أضف المتغيرات التالية:
   - `RENDER`: `true`
   - `PYTHON_VERSION`: `3.11.9`
   - `PORT`: `10000`
   - `SESSION_SECRET`: (أي نص عشوائي قوي لتأمين الجلسات)
5. اضغط **Deploy Web Service**.

---

## 🛠️ المتطلبات والتشغيل المحلي
```bash
# تثبيت الحزم
pip install -r requirements.txt

# تشغيل التطبيق
python main.py
```
سيعمل التطبيق افتراضياً على المنفذ `5000` محلياً أو `10000` على Render.
