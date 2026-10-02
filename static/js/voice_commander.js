/**
 * VoiceCommander - محرك التحكم الصوتي الذاتي الشامل لتطبيق مركز سرعة إنجاز
 * يدعم الاستماع المستمر، تحويل الأرقام واللهجات العربية، استخلاص النوايا وتنفيذ الأوامر فعلياً
 */

(function (window, document) {
    'use strict';

    // جدول تحويل الكلمات العربية المنطوقة للأرقام
    const ARABIC_WORD_TO_DIGIT = {
        'صفر': '0', 'زيرو': '0',
        'واحد': '1', 'واحده': '1', 'واحدة': '1', 'الاول': '1', 'الأول': '1',
        'اثنين': '2', 'إثنين': '2', 'اتنين': '2', 'اثنان': '2', 'الثاني': '2',
        'ثلاثة': '3', 'تلاتة': '3', 'ثلاث': '3', 'تلاته': '3', 'الثالث': '3',
        'اربعة': '4', 'أربعة': '4', 'اربع': '4', 'أربع': '4', 'الرابع': '4',
        'خمسة': '5', 'خمس': '5', 'الخامس': '5',
        'ستة': '6', 'ست': '6', 'السادس': '6',
        'سبعة': '7', 'سبع': '7', 'السابع': '7',
        'ثمانية': '8', 'تمانية': '8', 'ثمان': '8', 'تمان': '8', 'الثامن': '8',
        'تسعة': '9', 'تسع': '9', 'التاسع': '9',
        'زائد': '+', 'موجب': '+', 'بلس': '+'
    };

    const ARABIC_EASTERN_DIGITS = {
        '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
        '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
    };

    class VoiceCommander {
        constructor() {
            this.recognition = null;
            this.isListening = false;
            this.ttsEnabled = true;
            this.autoRestart = true;
            this.synth = window.speechSynthesis || null;
            this.audioCtx = null;
            this.lastTranscript = '';
            this.processingLock = false;
            this.init();
        }

        init() {
            // التحقق من دعم المتصفح للتعرف على الصوت
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                console.warn('[VoiceCommander] SpeechRecognition is not supported in this browser.');
                this.supported = false;
                return;
            }
            this.supported = true;

            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'ar-SA';
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.maxAlternatives = 1;

            this.bindEvents();
            this.injectUI();
        }

        bindEvents() {
            if (!this.recognition) return;

            this.recognition.onstart = () => {
                this.isListening = true;
                this.updateUIState(true);
                this.playTone(440, 0.1);
            };

            this.recognition.onend = () => {
                this.isListening = false;
                this.updateUIState(false);
                // إعادة التشغيل التلقائي إذا كان وضع الاستماع الدائم مفعلاً
                if (this.autoRestart && this.shouldStayActive) {
                    try {
                        this.recognition.start();
                    } catch (_) {}
                }
            };

            this.recognition.onerror = (e) => {
                console.warn('[VoiceCommander] Speech Error:', e.error);
                if (e.error === 'not-allowed') {
                    this.shouldStayActive = false;
                    this.speak('يرجى السماح بصلاحية الميكروفون لاستخدام التحكم الصوتي');
                }
            };

            this.recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }

                const currentText = (finalTranscript || interimTranscript).trim();
                if (currentText) {
                    this.showTranscript(currentText, Boolean(finalTranscript));
                }

                if (finalTranscript && !this.processingLock) {
                    this.handleVoiceCommand(finalTranscript.trim());
                }
            };
        }

        // تشغيل نغمة صوتية ترحيبية أو تأكيدية لطيفة
        playTone(freq = 440, duration = 0.15) {
            try {
                if (!this.audioCtx) {
                    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
                if (this.audioCtx.state === 'suspended') {
                    this.audioCtx.resume();
                }
                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
                gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
                osc.connect(gain);
                gain.connect(this.audioCtx.destination);
                osc.start();
                osc.stop(this.audioCtx.currentTime + duration);
            } catch (_) {}
        }

        // نطق الرد الصوتي العربي للمستخدم
        speak(text) {
            if (!this.ttsEnabled || !this.synth || !text) return;
            try {
                this.synth.cancel(); // إلغاء أي كلام سابق
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'ar-SA';
                utterance.rate = 1.05;
                utterance.pitch = 1.0;

                // محاولة اختيار أفضل صوت عربي متوفر
                const voices = this.synth.getVoices();
                const arVoice = voices.find(v => v.lang.startsWith('ar') || v.name.includes('Arabic'));
                if (arVoice) utterance.voice = arVoice;

                this.setSpeakingState(true);
                utterance.onend = () => this.setSpeakingState(false);
                utterance.onerror = () => this.setSpeakingState(false);
                this.synth.speak(utterance);
            } catch (err) {
                console.warn('[VoiceCommander] TTS Error:', err);
                this.setSpeakingState(false);
            }
        }

        // تطبيع وتحويل الكلمات والأرقام العربية إلى أرقام نقية
        normalizeSpokenDigits(text) {
            if (!text) return '';
            let s = text.trim();

            // استبدال الأرقام المشرقية ٠١٢٣٤٥٦٧٨٩
            for (const [k, v] of Object.entries(ARABIC_EASTERN_DIGITS)) {
                s = s.split(k).join(v);
            }

            // استبدال الكلمات النصية (مثل "صفر واحد واحد اتنين...")
            const words = s.split(/\s+/);
            const converted = words.map(w => {
                const cleaned = w.replace(/[،,.]/g, '');
                return ARABIC_WORD_TO_DIGIT[cleaned] !== undefined ? ARABIC_WORD_TO_DIGIT[cleaned] : w;
            });
            s = converted.join(' ');

            // استخراج الأرقام المتصلة إذا وجدت
            const digitMatches = s.match(/[\d+]+/g);
            return digitMatches ? digitMatches.join('') : '';
        }

        // استخلاص الأرقام من العبارة المنطوقة
        extractNumbers(text) {
            // فحص الكلمات المنطوقة للأرقام
            let words = text.split(/\s+/);
            let digitsStr = '';
            for (const w of words) {
                const cleanW = w.replace(/[،,.]/g, '');
                if (ARABIC_WORD_TO_DIGIT[cleanW] !== undefined) {
                    digitsStr += ARABIC_WORD_TO_DIGIT[cleanW];
                } else if (/^\d+$/.test(cleanW)) {
                    digitsStr += cleanW;
                }
            }
            if (digitsStr) return digitsStr;
            return this.normalizeSpokenDigits(text);
        }

        // إضاءة وتظليل العنصر المتأثر على الشاشة بصرياً
        highlight(el) {
            if (!el) return;
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('voice-command-highlight');
            setTimeout(() => {
                el.classList.remove('voice-command-highlight');
            }, 2500);
        }

        // معالجة الأمر الصوتي الرئيسي
        async handleVoiceCommand(rawTranscript) {
            const text = rawTranscript.toLowerCase().trim();
            console.log('[VoiceCommander] 🎙️ Recieved Command:', text);
            this.processingLock = true;

            try {
                // 1. أوامر تسجيل الدخول بالرقم أو الاسم
                if (text.includes('سجل') || text.includes('دخول') || text.includes('تسجيل الدخول') || text.includes('حساب')) {
                    // فحص حساب لميس
                    if (text.includes('لميس') || text.includes('حساب 1') || text.includes('الحساب الاول') || text.includes('الاول')) {
                        await this.cmdLoginNamedAccount('user_1', '+201120945094', 'لميس');
                        return;
                    }

                    // فحص الحساب الثاني
                    if (text.includes('الثاني') || text.includes('حساب 2')) {
                        await this.cmdLoginNamedAccount('user_2', '+201221349790', 'الحساب الثاني');
                        return;
                    }

                    // فحص الحساب الثالث
                    if (text.includes('الثالث') || text.includes('حساب 3')) {
                        await this.cmdLoginNamedAccount('user_3', '+201148863243', 'الحساب الثالث');
                        return;
                    }

                    // فحص تسجيل الدخول برقم مخصص
                    const digits = this.extractNumbers(text);
                    if (digits && digits.length >= 8) {
                        await this.cmdLoginByPhoneNumber(digits);
                        return;
                    }
                }

                // 2. إدخال كود التحقق صوتياً
                if (text.includes('كود') || text.includes('الكود') || text.includes('الرمز') || text.includes('تحقق')) {
                    const code = this.extractNumbers(text);
                    if (code && code.length >= 4) {
                        await this.cmdVerifyCode(code);
                        return;
                    }
                }

                // 3. التحقق بخطوتين / كلمة المرور
                if (text.includes('كلمة المرور') || text.includes('الباسورد') || text.includes('السر') || text.includes('رمز سري')) {
                    // استخراج كلمة المرور بعد العبارة
                    let pass = text.replace(/.*(كلمة المرور|الباسورد|السر|رمز سري)\s*(هي|هو)?\s*/i, '').trim();
                    if (pass) {
                        await this.cmdVerifyPassword(pass);
                        return;
                    }
                }

                // 4. إعادة إرسال الكود
                if (text.includes('اعادة ارسال') || text.includes('إعادة إرسال') || text.includes('ارسل الكود ثاني') || text.includes('ارسل الكود مره')) {
                    const forceSms = text.includes('رسالة') || text.includes('sms') || text.includes('اس ام اس');
                    await this.cmdResendCode(forceSms);
                    return;
                }

                // 5. استعراض وفحص روابط قاعدة البيانات السحابية
                if (text.includes('استعرض') || text.includes('روابط') || text.includes('قاعدة البيانات') || text.includes('فحص الروابط') || text.includes('الروابط المحفوظة')) {
                    if (text.includes('بي دي اف') || text.includes('pdf')) {
                        await this.cmdExportLinks('pdf');
                        return;
                    }
                    if (text.includes('نص') || text.includes('نصي') || text.includes('txt') || text.includes('تكست')) {
                        await this.cmdExportLinks('txt');
                        return;
                    }
                    await this.cmdInspectCloudLinks();
                    return;
                }

                // 6. تصدير الروابط
                if (text.includes('تصدير') || text.includes('تنزيل') || text.includes('تحميل')) {
                    if (text.includes('pdf') || text.includes('بي دي اف')) {
                        await this.cmdExportLinks('pdf');
                        return;
                    }
                    if (text.includes('txt') || text.includes('نص') || text.includes('نصي') || text.includes('تكست')) {
                        await this.cmdExportLinks('txt');
                        return;
                    }
                }

                // 7. التحكم في الإرسال: بدء أو إيقاف المهمة
                if (text.includes('ابدأ') || text.includes('تشغيل') || text.includes('انطلق') || text.includes('ارسل الان') || text.includes('ابدء')) {
                    if (text.includes('ارسال') || text.includes('إرسال') || text.includes('مهمة') || text.includes('حملة')) {
                        await this.cmdStartBroadcast();
                        return;
                    }
                }

                if (text.includes('اوقف') || text.includes('أوقف') || text.includes('ايقاف') || text.includes('إيقاف') || text.includes('توقف') || text.includes('وقف')) {
                    if (text.includes('ارسال') || text.includes('إرسال') || text.includes('مهمة') || text.includes('حملة') || text.includes('كل شيء')) {
                        await this.cmdStopBroadcast();
                        return;
                    }
                }

                // 8. اختيار نوع الإرسال
                if (text.includes('مجموعات') || text.includes('جروبات') || text.includes('قروبات')) {
                    await this.cmdSelectSendType('groups');
                    return;
                }
                if (text.includes('قنوات') || text.includes('قناة')) {
                    await this.cmdSelectSendType('channels');
                    return;
                }
                if (text.includes('فردي') || text.includes('خاص') || text.includes('مستخدمين')) {
                    await this.cmdSelectSendType('users');
                    return;
                }

                // 9. ضبط الفاصل الزمني
                if (text.includes('فاصل') || text.includes('ثانية') || text.includes('دقيقة') || text.includes('وقت')) {
                    const nums = this.extractNumbers(text);
                    if (nums) {
                        let sec = parseInt(nums, 10);
                        if (text.includes('دقيقة') || text.includes('دقايق')) sec = sec * 60;
                        await this.cmdSetInterval(sec);
                        return;
                    }
                }

                // 10. حفظ الإعدادات
                if (text.includes('احفظ') || text.includes('حفظ الاعدادات') || text.includes('حفظ الإعدادات') || text.includes('تثبيت')) {
                    await this.cmdSaveSettings();
                    return;
                }

                // 11. نص الرسالة
                if (text.startsWith('اكتب') || text.startsWith('الرسالة هي') || text.startsWith('نص الرسالة')) {
                    const msg = text.replace(/^(اكتب في الرسالة|اكتب رسالة|اكتب|الرسالة هي|نص الرسالة)\s*/i, '').trim();
                    if (msg) {
                        await this.cmdSetMessage(msg);
                        return;
                    }
                }

                // 12. التنقل والاستفسار العام
                if (text.includes('الحالة') || text.includes('مين متصل') || text.includes('حالة الحساب') || text.includes('وضع النظام')) {
                    await this.cmdCheckStatus();
                    return;
                }

                if (text.includes('محلل') || text.includes('مستندات') || text.includes('ذكاء اصطناعي')) {
                    this.speak('جارٍ فتح المحلل الذكي للمستندات والصور');
                    window.location.href = '/ai_doc_analyzer';
                    return;
                }

                if (text.includes('الرئيسية') || text.includes('الرئيسيه') || text.includes('لوحة التحكم')) {
                    this.speak('جارٍ الانتقال إلى الصفحة الرئيسية');
                    window.location.href = '/';
                    return;
                }

                // لم يتم التعرف على أمر محدد
                this.speak('سمعت أمرك: ' + rawTranscript + '. يرجى تجربة أمر مثل: سجل بحساب لميس، أو ابدأ الإرسال.');

            } catch (err) {
                console.error('[VoiceCommander] Execution Error:', err);
                this.speak('حدث خطأ أثناء تنفيذ الأمر: ' + (err.message || ''));
            } finally {
                setTimeout(() => {
                    this.processingLock = false;
                }, 1500);
            }
        }

        // ======================= دوال التنفيذ الفعلية للأوامر =======================

        async cmdLoginNamedAccount(uid, phone, name) {
            this.speak(`جارٍ تسجيل الدخول بحساب ${name}`);
            const phoneInput = document.getElementById('phone');
            const dropdown = document.getElementById('savedPhonesDropdown');

            if (dropdown) {
                dropdown.value = phone;
                this.highlight(dropdown);
            }
            if (phoneInput) {
                phoneInput.value = phone;
                this.highlight(phoneInput);
            }

            // محاولة الضغط التلقائي على زر إرسال الكود
            const sendBtn = document.getElementById('sendCodeBtn') || document.querySelector('button[onclick*="sendCode"]');
            if (sendBtn) {
                this.highlight(sendBtn);
                sendBtn.click();
            } else if (typeof window.sendCode === 'function') {
                window.sendCode();
            }
        }

        async cmdLoginByPhoneNumber(phone) {
            let formatted = phone.startsWith('+') ? phone : ('+' + phone);
            this.speak(`جارٍ تسجيل الدخول بالرقم ${formatted}`);
            const phoneInput = document.getElementById('phone');
            if (phoneInput) {
                phoneInput.value = formatted;
                this.highlight(phoneInput);
            }
            const sendBtn = document.getElementById('sendCodeBtn') || document.querySelector('button[onclick*="sendCode"]');
            if (sendBtn) {
                this.highlight(sendBtn);
                sendBtn.click();
            } else if (typeof window.sendCode === 'function') {
                window.sendCode();
            }
        }

        async cmdVerifyCode(code) {
            this.speak(`تم استلام الكود ${code.split('').join(' ')}، جارٍ التحقق والتسجيل`);
            const codeInput = document.getElementById('loginCode') || document.querySelector('input[name="code"]');
            if (codeInput) {
                codeInput.value = code;
                this.highlight(codeInput);
            }
            const verifyBtn = document.getElementById('verifyCodeBtn') || document.querySelector('button[onclick*="verifyCode"]');
            if (verifyBtn) {
                this.highlight(verifyBtn);
                verifyBtn.click();
            } else if (typeof window.verifyCode === 'function') {
                window.verifyCode();
            }
        }

        async cmdVerifyPassword(password) {
            this.speak('تم إدخال كلمة المرور، جارٍ التحقق بخطوتين');
            const passInput = document.getElementById('twoFactorPassword') || document.querySelector('input[type="password"]');
            if (passInput) {
                passInput.value = password;
                this.highlight(passInput);
            }
            const verifyPassBtn = document.getElementById('verifyPasswordBtn') || document.querySelector('button[onclick*="verifyPassword"]');
            if (verifyPassBtn) {
                this.highlight(verifyPassBtn);
                verifyPassBtn.click();
            } else if (typeof window.verifyPassword === 'function') {
                window.verifyPassword();
            }
        }

        async cmdResendCode(forceSms = false) {
            this.speak(forceSms ? 'جارٍ إعادة إرسال الكود عبر الرسائل القصيرة SMS' : 'جارٍ إعادة إرسال كود التحقق عبر تليجرام');
            const btn = document.getElementById(forceSms ? 'resendSmsBtn' : 'resendCodeBtn');
            if (btn) {
                this.highlight(btn);
                btn.click();
            } else if (typeof window.resendCode === 'function') {
                window.resendCode(forceSms);
            }
        }

        async cmdInspectCloudLinks() {
            this.speak('جارٍ فحص واستعراض كافة روابط قاعدة البيانات السحابية');
            const inspectBtn = document.getElementById('inspectCloudLinksBtn');
            if (inspectBtn) {
                this.highlight(inspectBtn);
                inspectBtn.click();
            } else if (typeof window.inspectCloudLinks === 'function') {
                await window.inspectCloudLinks();
            } else {
                // استدعاء مباشر لـ API
                try {
                    const res = await fetch('/api/saved_links/inspect_status');
                    const data = await res.json();
                    if (data.total_links > 0) {
                        this.speak(`قاعدة البيانات السحابية نشطة وتحتوي على ${data.total_links} رابط محفوظ.`);
                    } else {
                        this.speak('قاعدة البيانات متصلة ولكن لا توجد روابط محفوظة حالياً.');
                    }
                } catch (_) {
                    this.speak('تعذر الاتصال بقاعدة البيانات السحابية في الوقت الحالي.');
                }
            }
        }

        async cmdExportLinks(format = 'pdf') {
            if (format === 'pdf') {
                this.speak('جارٍ إنشاء وتصدير ملف الروابط بصيغة PDF إلى جهازك');
                const btn = document.getElementById('exportPdfBtn') || document.getElementById('exportAllPdfBtn');
                if (btn) {
                    this.highlight(btn);
                    btn.click();
                } else if (typeof window.exportSavedLinksPDF === 'function') {
                    window.exportSavedLinksPDF();
                }
            } else {
                this.speak('جارٍ تصدير ملف الروابط النصي TXT إلى جهازك');
                const btn = document.getElementById('exportTxtBtn') || document.getElementById('exportAllTxtBtn');
                if (btn) {
                    this.highlight(btn);
                    btn.click();
                } else if (typeof window.exportSavedLinksTXT === 'function') {
                    window.exportSavedLinksTXT();
                }
            }
        }

        async cmdStartBroadcast() {
            this.speak('أمر مؤكد: جارٍ بدء مهمة الإرسال الآن');
            const startBtn = document.getElementById('startBtn') || document.querySelector('button[onclick*="start"]') || document.querySelector('.btn-success');
            if (startBtn) {
                this.highlight(startBtn);
                startBtn.click();
            }
        }

        async cmdStopBroadcast() {
            this.speak('أمر مؤكد: تم إيقاف مهمة الإرسال');
            const stopBtn = document.getElementById('stopBtn') || document.querySelector('button[onclick*="stop"]') || document.querySelector('.btn-danger');
            if (stopBtn) {
                this.highlight(stopBtn);
                stopBtn.click();
            }
        }

        async cmdSelectSendType(type) {
            const types = {
                'groups': 'إرسال للمجموعات',
                'channels': 'إرسال للقنوات',
                'users': 'إرسال فردي للمستخدمين'
            };
            this.speak(`تم تحديد نوع الإرسال: ${types[type] || type}`);
            const input = document.querySelector(`input[name="send_type"][value="${type}"]`) || document.getElementById(`send_type_${type}`);
            if (input) {
                input.checked = true;
                input.dispatchEvent(new Event('change'));
                this.highlight(input.parentElement || input);
            }
        }

        async cmdSetInterval(seconds) {
            this.speak(`تم ضبط الفاصل الزمني على ${seconds} ثانية`);
            const delayInput = document.getElementById('delay') || document.getElementById('interval') || document.querySelector('input[name="delay"]');
            if (delayInput) {
                delayInput.value = seconds;
                delayInput.dispatchEvent(new Event('change'));
                this.highlight(delayInput);
            }
        }

        async cmdSaveSettings() {
            this.speak('جارٍ حفظ الإعدادات');
            const saveBtn = document.getElementById('saveSettingsBtn') || document.querySelector('button[type="submit"]') || document.querySelector('button[onclick*="save"]');
            if (saveBtn) {
                this.highlight(saveBtn);
                saveBtn.click();
            }
        }

        async cmdSetMessage(msgText) {
            this.speak('تم وضع نص الرسالة بنجاح');
            const msgArea = document.getElementById('message') || document.getElementById('auto_reply_message') || document.querySelector('textarea');
            if (msgArea) {
                msgArea.value = msgText;
                msgArea.dispatchEvent(new Event('input'));
                this.highlight(msgArea);
            }
        }

        async cmdCheckStatus() {
            try {
                const res = await fetch('/api/get_login_status');
                const data = await res.json();
                const name = data.account_name || 'حساب لميس';
                const status = data.logged_in ? 'متصل وموثق' : 'غير متصل حالياً';
                const running = data.is_running ? 'وهناك مهمة إرسال قيد التشغيل' : 'ولا توجد مهام إرسال تعمل حالياً';
                this.speak(`الحساب النشط هو ${name}، الحالة: ${status}، ${running}.`);
            } catch (_) {
                this.speak('التطبيق يعمل بشكل طبيعي ومتصل بالخادم.');
            }
        }

        // ======================= إدارة واجهة المستخدم الصوتية =======================

        toggle() {
            if (this.isListening) {
                this.stop();
            } else {
                this.start();
            }
        }

        start() {
            if (!this.supported) {
                alert('التعرف الصوتي غير مدعوم في متصفحك الحالي. يرجى استخدام Google Chrome أو متصفح يدعم Web Speech API.');
                return;
            }
            this.shouldStayActive = true;
            try {
                this.recognition.start();
                this.speak('نظام الأوامر الصوتية نشط. أنا أستمع إليك الآن.');
            } catch (e) {
                console.warn('[VoiceCommander] Already started or busy:', e);
            }
        }

        stop() {
            this.shouldStayActive = false;
            if (this.recognition) {
                try {
                    this.recognition.stop();
                    this.speak('تم إيقاف وضع الاستماع الصوتي.');
                } catch (_) {}
            }
            this.updateUIState(false);
        }

        toggleTTS() {
            this.ttsEnabled = !this.ttsEnabled;
            const btn = document.getElementById('voiceTtsToggleBtn');
            if (btn) {
                btn.innerHTML = this.ttsEnabled ? '<i class="fas fa-volume-up text-success"></i>' : '<i class="fas fa-volume-mute text-secondary"></i>';
                btn.title = this.ttsEnabled ? 'الرد الصوتي ناطق (مفعّل)' : 'الرد الصوتي صامت';
            }
            if (this.ttsEnabled) this.speak('تم تفعيل الرد الصوتي الناطق.');
        }

        updateUIState(active) {
            const btn = document.getElementById('floatingVoiceBtn');
            const hud = document.getElementById('voiceCommanderHud');
            const wave = document.getElementById('voiceWaveIndicator');

            if (btn) {
                if (active) {
                    btn.classList.add('voice-active');
                    btn.setAttribute('aria-pressed', 'true');
                } else {
                    btn.classList.remove('voice-active');
                    btn.setAttribute('aria-pressed', 'false');
                }
            }

            if (hud) {
                if (active) {
                    hud.classList.add('show');
                } else {
                    hud.classList.remove('show');
                }
            }

            if (wave) {
                wave.style.display = active ? 'flex' : 'none';
            }
        }

        setSpeakingState(isSpeaking) {
            const botIcon = document.getElementById('voiceBotSpeakerIcon');
            if (botIcon) {
                if (isSpeaking) {
                    botIcon.classList.add('voice-speaking-pulse');
                } else {
                    botIcon.classList.remove('voice-speaking-pulse');
                }
            }
        }

        showTranscript(text, isFinal) {
            const display = document.getElementById('voiceLiveTranscript');
            if (display) {
                display.textContent = text;
                display.style.opacity = isFinal ? '1' : '0.75';
                if (isFinal) {
                    display.classList.add('highlight-final');
                    setTimeout(() => display.classList.remove('highlight-final'), 1200);
                }
            }
        }

        injectUI() {
            // التحقق من عدم التكرار
            if (document.getElementById('voiceCommanderContainer')) return;

            // حقن تنسيقات CSS الخاصة بالتحكم الصوتي
            const style = document.createElement('style');
            style.id = 'voiceCommanderStyles';
            style.textContent = `
                /* زر الميكروفون العائم */
                .floating-voice-hub {
                    position: fixed;
                    bottom: 24px;
                    left: 24px;
                    z-index: 99999;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 12px;
                    pointer-events: none;
                }
                .floating-voice-btn {
                    pointer-events: auto;
                    width: 58px;
                    height: 58px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #0088cc 0%, #005f8f 100%);
                    color: #ffffff;
                    border: none;
                    box-shadow: 0 8px 24px rgba(0, 136, 204, 0.45);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.45rem;
                    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    position: relative;
                }
                .floating-voice-btn:hover {
                    transform: scale(1.08);
                    box-shadow: 0 10px 30px rgba(0, 136, 204, 0.6);
                }
                .floating-voice-btn.voice-active {
                    background: linear-gradient(135deg, #e53935 0%, #b71c1c 100%);
                    box-shadow: 0 0 0 0 rgba(229, 57, 53, 0.7);
                    animation: voicePulse 1.8s infinite;
                }
                @keyframes voicePulse {
                    0% {
                        box-shadow: 0 0 0 0 rgba(229, 57, 53, 0.7), 0 8px 25px rgba(229, 57, 53, 0.5);
                    }
                    70% {
                        box-shadow: 0 0 0 18px rgba(229, 57, 53, 0), 0 8px 25px rgba(229, 57, 53, 0.5);
                    }
                    100% {
                        box-shadow: 0 0 0 0 rgba(229, 57, 53, 0), 0 8px 25px rgba(229, 57, 53, 0.5);
                    }
                }
                .voice-pulse-ring {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    border: 2px solid #0088cc;
                    animation: voiceRing 2s linear infinite;
                    opacity: 0;
                    display: none;
                }
                .voice-active .voice-pulse-ring {
                    display: block;
                    border-color: #ff5252;
                }
                @keyframes voiceRing {
                    0% { transform: scale(1); opacity: 0.8; }
                    100% { transform: scale(1.6); opacity: 0; }
                }

                /* شريط HUD السفلي لعرض النص والردود */
                .voice-commander-hud {
                    pointer-events: auto;
                    background: rgba(17, 24, 39, 0.95);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 16px;
                    padding: 12px 18px;
                    color: #ffffff;
                    min-width: 290px;
                    max-width: 440px;
                    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
                    display: none;
                    flex-direction: column;
                    gap: 8px;
                    font-size: 0.88rem;
                    direction: rtl;
                    transform: translateY(10px);
                    opacity: 0;
                    transition: all 0.3s ease;
                }
                .voice-commander-hud.show {
                    display: flex;
                    transform: translateY(0);
                    opacity: 1;
                }
                .voice-hud-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    padding-bottom: 6px;
                }
                .voice-hud-title {
                    font-weight: 700;
                    font-size: 0.82rem;
                    color: #60a5fa;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .voice-live-transcript {
                    font-size: 0.92rem;
                    color: #f3f4f6;
                    font-weight: 500;
                    min-height: 24px;
                    line-height: 1.4;
                    word-break: break-word;
                }
                .voice-live-transcript.highlight-final {
                    color: #34d399;
                    font-weight: 600;
                }

                /* موجات الصوت التفاعلية */
                .voice-waves-container {
                    display: flex;
                    align-items: center;
                    gap: 3px;
                    height: 14px;
                }
                .voice-wave-bar {
                    width: 3px;
                    background: #60a5fa;
                    border-radius: 3px;
                    animation: wavePulse 1s ease-in-out infinite;
                }
                .voice-wave-bar:nth-child(1) { height: 6px; animation-delay: 0.0s; }
                .voice-wave-bar:nth-child(2) { height: 12px; animation-delay: 0.2s; }
                .voice-wave-bar:nth-child(3) { height: 16px; animation-delay: 0.4s; }
                .voice-wave-bar:nth-child(4) { height: 9px; animation-delay: 0.1s; }
                @keyframes wavePulse {
                    0%, 100% { transform: scaleY(0.4); }
                    50% { transform: scaleY(1.4); }
                }

                /* وميض المتكلم */
                .voice-speaking-pulse {
                    color: #38bdf8 !important;
                    animation: botPulse 0.8s infinite alternate;
                }
                @keyframes botPulse {
                    from { transform: scale(1); filter: drop-shadow(0 0 2px #38bdf8); }
                    to { transform: scale(1.25); filter: drop-shadow(0 0 8px #0284c7); }
                }

                /* تظليل العنصر المتأثر بالأمر الصوتي */
                .voice-command-highlight {
                    outline: 4px solid #0088cc !important;
                    outline-offset: 3px !important;
                    box-shadow: 0 0 25px rgba(0, 136, 204, 0.8) !important;
                    transition: all 0.3s ease !important;
                    transform: scale(1.02) !important;
                }
            `;
            document.head.appendChild(style);

            // إنشاء هيكل HTML
            const container = document.createElement('div');
            container.id = 'voiceCommanderContainer';
            container.className = 'floating-voice-hub';
            container.innerHTML = `
                <!-- شريط HUD السفلي للنص والردود -->
                <div class="voice-commander-hud" id="voiceCommanderHud">
                    <div class="voice-hud-header">
                        <div class="voice-hud-title">
                            <span class="voice-waves-container" id="voiceWaveIndicator">
                                <span class="voice-wave-bar"></span>
                                <span class="voice-wave-bar"></span>
                                <span class="voice-wave-bar"></span>
                                <span class="voice-wave-bar"></span>
                            </span>
                            <span>التحكم الصوتي نشط</span>
                            <i class="fas fa-robot ms-1" id="voiceBotSpeakerIcon" title="مساعد الأوامر الصوتية"></i>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <button type="button" class="btn btn-sm btn-link text-white p-0 text-decoration-none" id="voiceTtsToggleBtn" title="كتم / تفعيل الصوت">
                                <i class="fas fa-volume-up text-success"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-link text-white p-0 text-decoration-none" id="voiceHelpBtn" title="قاموس الأوامر الصوتية" data-bs-toggle="modal" data-bs-target="#voiceHelpModal">
                                <i class="fas fa-question-circle text-info"></i>
                            </button>
                            <button type="button" class="btn-close btn-close-white" style="font-size:0.65rem;" id="voiceHudCloseBtn" aria-label="إغلاق"></button>
                        </div>
                    </div>
                    <div class="voice-live-transcript" id="voiceLiveTranscript">
                        تحدث بأمرك الآن... (مثال: سجل بحساب لميس، الكود هو ...، ابدأ الإرسال، استعرض الروابط)
                    </div>
                </div>

                <!-- زر الميكروفون العائم -->
                <button type="button" class="floating-voice-btn" id="floatingVoiceBtn" title="التحكم الصوتي بالتطبيق (اضغط للتحدث)">
                    <span class="voice-pulse-ring"></span>
                    <i class="fas fa-microphone" id="floatingVoiceIcon"></i>
                </button>
            `;
            document.body.appendChild(container);

            // إضافة مودال قاموس الأوامر الصوتية
            this.injectHelpModal();

            // ربط أحداث النقر
            document.getElementById('floatingVoiceBtn').addEventListener('click', () => this.toggle());
            document.getElementById('voiceTtsToggleBtn').addEventListener('click', () => this.toggleTTS());
            document.getElementById('voiceHudCloseBtn').addEventListener('click', () => this.stop());
        }

        injectHelpModal() {
            if (document.getElementById('voiceHelpModal')) return;
            const modal = document.createElement('div');
            modal.id = 'voiceHelpModal';
            modal.className = 'modal fade';
            modal.setAttribute('tabindex', '-1');
            modal.setAttribute('aria-hidden', 'true');
            modal.innerHTML = `
                <div class="modal-dialog modal-dialog-centered modal-lg">
                    <div class="modal-content shadow-lg border-0" style="border-radius: 20px; overflow: hidden; direction: rtl;">
                        <div class="modal-header text-white" style="background: linear-gradient(135deg, #0088cc 0%, #005f8f 100%);">
                            <h5 class="modal-title fw-bold">
                                <i class="fas fa-microphone-alt me-2"></i> قاموس الأوامر الصوتية الذكية الشامل
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="إغلاق"></button>
                        </div>
                        <div class="modal-body p-4" style="background: #f8fafc;">
                            <p class="text-muted mb-4">
                                يمكنك التحكم في كافة أقسام التطبيق بحرية تامة وبدون لمس الشاشة، فقط قل أي من الأوامر التالية بصوت واضح:
                            </p>
                            <div class="row g-3">
                                <div class="col-md-6">
                                    <div class="p-3 bg-white rounded-3 shadow-sm border-start border-4 border-primary h-100">
                                        <h6 class="fw-bold text-primary mb-2"><i class="fas fa-sign-in-alt me-1"></i> تسجيل الدخول والحسابات</h6>
                                        <ul class="list-unstyled mb-0 small text-secondary">
                                            <li class="mb-1">🔹 <strong>«سجل بحساب لميس»</strong>: يملأ رقم لميس ويطلب الكود فوراً.</li>
                                            <li class="mb-1">🔹 <strong>«سجل برقم زائد عشرين...»</strong>: يضع أي رقم تريده ويطلب الكود.</li>
                                            <li class="mb-1">🔹 <strong>«الكود هو تسعة خمسة أربعة اثنين...»</strong>: يدخل الكود ويتحقق.</li>
                                            <li class="mb-1">🔹 <strong>«كلمة المرور هي [كلمتك]»</strong>: يدخل كلمة التحقق بخطوتين.</li>
                                            <li class="mb-1">🔹 <strong>«أعد إرسال الكود»</strong> أو <strong>«أرسل الكود عبر SMS»</strong>.</li>
                                        </ul>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="p-3 bg-white rounded-3 shadow-sm border-start border-4 border-success h-100">
                                        <h6 class="fw-bold text-success mb-2"><i class="fas fa-paper-plane me-1"></i> مهام الإرسال والمراسلة</h6>
                                        <ul class="list-unstyled mb-0 small text-secondary">
                                            <li class="mb-1">🔹 <strong>«ابدأ الإرسال»</strong> / <strong>«تشغيل المهمة»</strong>: بدء الإرسال فوراً.</li>
                                            <li class="mb-1">🔹 <strong>«أوقف الإرسال»</strong> / <strong>«توقف»</strong>: إيقاف الإرسال بلحظتها.</li>
                                            <li class="mb-1">🔹 <strong>«إرسال للمجموعات»</strong> أو <strong>«إرسال للقنوات»</strong> أو <strong>«إرسال فردي»</strong>.</li>
                                            <li class="mb-1">🔹 <strong>«اضبط الفاصل الزمني ثلاثين ثانية»</strong>.</li>
                                            <li class="mb-1">🔹 <strong>«اكتب في الرسالة [نصك]»</strong>: يملأ مربع الرسالة.</li>
                                            <li class="mb-1">🔹 <strong>«احفظ الإعدادات»</strong>: يحفظ التعديلات فوراً.</li>
                                        </ul>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="p-3 bg-white rounded-3 shadow-sm border-start border-4 border-info h-100">
                                        <h6 class="fw-bold text-info mb-2"><i class="fas fa-link me-1"></i> روابط قاعدة البيانات السحابية</h6>
                                        <ul class="list-unstyled mb-0 small text-secondary">
                                            <li class="mb-1">🔹 <strong>«استعرض روابط قاعدة البيانات»</strong>: يفحص السحابة وينطق عددها.</li>
                                            <li class="mb-1">🔹 <strong>«صدّر الروابط ملف PDF»</strong>: ينزل تقرير PDF فورياً لذاكرة جهازك.</li>
                                            <li class="mb-1">🔹 <strong>«صدّر الروابط ملف نصي TXT»</strong>: ينزل ملف TXT لذاكرتك.</li>
                                        </ul>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="p-3 bg-white rounded-3 shadow-sm border-start border-4 border-warning h-100">
                                        <h6 class="fw-bold text-warning mb-2"><i class="fas fa-compass me-1"></i> التنقل والاستفسار</h6>
                                        <ul class="list-unstyled mb-0 small text-secondary">
                                            <li class="mb-1">🔹 <strong>«ما هي حالة الحساب؟»</strong>: ينطق اسم الحساب المتصل ووضعه.</li>
                                            <li class="mb-1">🔹 <strong>«افتح المحلل الذكي للمستندات»</strong>: ينتقل لصفحة المحلل.</li>
                                            <li class="mb-1">🔹 <strong>«الصفحة الرئيسية»</strong>: يعيدك للرئيسية.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer bg-white border-top-0 d-flex justify-content-between">
                            <span class="text-muted small"><i class="fas fa-check-circle text-success me-1"></i> مدعوم بالنطق الصوتي والتحليل الذاتي</span>
                            <button type="button" class="btn btn-primary px-4" data-bs-dismiss="modal">فهمت، جاهز للتجربة</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
    }

    // تهيئة المحرك وتثبيته في كائن النطاق العام عند تحميل المستند
    window.addEventListener('DOMContentLoaded', () => {
        window.voiceCommander = new VoiceCommander();
    });

})(window, document);
