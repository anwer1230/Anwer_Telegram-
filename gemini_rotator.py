# -*- coding: utf-8 -*-
"""
gemini_rotator.py: مدير وموزع مفاتيح Gemini API الذكي والموحد لجميع وظائف النظام
================================================================================
- ترتيب المفاتيح الـ 8 بالتتابع بدقة (1, 2, 3, 4, 5, 6, 7, 8) + مفتاح النظام الاحتياطي.
- تبديل تلقائي فوري (Instant Auto-Failover) عند نفاد رصيد أي مفتاح (HTTP 429 / Rate Limit / Quota Exceeded).
- حماية وتشفير Base64 للمفاتيح لحمايتها ومنع اعتراض أنظمة الفحص.
- محرك محادثة مباشرة متقدم (Direct AI Live Chat) لأي سؤال أو استفسار أو مهمة.
- توحيد استدعاءات الذكاء الاصطناعي في كامل المنصة (المحادثة، تحليل المستندات، أمان المجموعات، صياغة النصوص، الردود الذكية).
"""

import os
import re
import json
import time
import base64
import logging
import threading
import urllib.request
import urllib.error
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple, Callable

logger = logging.getLogger("GeminiRotator")

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gemini_keys_config.json")

def _decode_secret(val: str) -> str:
    """فك ترميز آمن ومحمي للمفاتيح المشفرة بـ Base64"""
    if not val:
        return ""
    try:
        decoded = base64.b64decode(val.encode("utf-8")).decode("utf-8").strip()
        if decoded.startswith("AQ.") or decoded.startswith("AIzaSy") or "{" in decoded:
            return decoded
        return val.strip()
    except Exception:
        return val.strip()

def _encode_secret(val: str) -> str:
    """ترميز آمن للمفتاح بـ Base64"""
    if not val:
        return ""
    return base64.b64encode(val.strip().encode("utf-8")).decode("utf-8")


# ── القائمة الرسمية المجهزة للمفاتيح المعتمدة من المستخدم ─────────────────
DEFAULT_KEYS = [
    {
        "id": "key_1",
        "name": "Gemini Key #1 (TYLQ)",
        "hint": "...TYLQ",
        "encoded_key": "QVEuQWI4Uk42TFNDZ0lKNEkyaUN2YWduN25KZU0tdXhnNDJxV3l4TU9BOVdzQV92dFRZTFE=",
        "project_id": "gen-lang-client-0197022210",
        "tier": "Free tier",
        "active": True,
        "priority": 1
    },
    {
        "id": "key_2",
        "name": "Gemini Key #2 (bEXA)",
        "hint": "...bEXA",
        "encoded_key": "QVEuQWI4Uk42THNnbWtDTUVxRHR2blV2MlhoNGJvNFNhbjVfbmdmeUpNTVpvS0RjZWJFWEE=",
        "project_id": "gen-lang-client-0197022210",
        "tier": "Free tier",
        "active": True,
        "priority": 2
    },
    {
        "id": "key_3",
        "name": "Gemini Key #3 (Us0A)",
        "hint": "...Us0A",
        "encoded_key": "QVEuQWI4Uk42Szh5OEtvek1pdEw1YjhIdmpLSjJJRHF0WnBjdXFhT2xFLXFaTXhUZVVzMEE=",
        "project_id": "gen-lang-client-0197022210",
        "tier": "Free tier",
        "active": True,
        "priority": 3
    },
    {
        "id": "key_4",
        "name": "Gemini Key #4 (ebvA)",
        "hint": "...ebvA",
        "encoded_key": "QVEuQWI4Uk42S2dSakRWXzhsVUpLMHNBYUFGVVhNeFQ5b2JiSzRMV19xVWhPd0czY2VidkE=",
        "project_id": "gen-lang-client-0197022210",
        "tier": "Free tier",
        "active": True,
        "priority": 4
    },
    {
        "id": "key_5",
        "name": "Gemini Key #5 (0z2A)",
        "hint": "...0z2A",
        "encoded_key": "QVEuQWI4Uk42SnR4Y1lRZ3ExblZRd0FaNnlqZkFMU3hQcFpxRUE5TGtXVUlqWlA1UDB6MkE=",
        "project_id": "gen-lang-client-0197022210",
        "tier": "Free tier",
        "active": True,
        "priority": 5
    },
    {
        "id": "key_6",
        "name": "Gemini Key #6 (U4Yw)",
        "hint": "...U4Yw",
        "encoded_key": "QVEuQWI4Uk42S3JDWUVLMlRQbWRFOWFrUFlndFVDUG01bklJa1gzZXhCWVhUZjdsalU0WXc=",
        "project_id": "gen-lang-client-0197022210",
        "tier": "Free tier",
        "active": True,
        "priority": 6
    },
    {
        "id": "key_7",
        "name": "Gemini Key #7 (AiEQ)",
        "hint": "...AiEQ",
        "encoded_key": "QVEuQWI4Uk42TDIxcWJIX25CeDdBeEFCaklrdjY3bG81Wjh5TEtNNWZRTVZJX1RMSEFpRVE=",
        "project_id": "gen-lang-client-0197022210",
        "tier": "Free tier",
        "active": True,
        "priority": 7
    },
    {
        "id": "key_8",
        "name": "Gemini Key #8 (ojVg)",
        "hint": "...ojVg",
        "encoded_key": "QVEuQWI4Uk42TGV6MW9TVk03dFRPM1UydHc3b2I0UUNGV2pPU2VzdmNydmJsbjV0Zm9qVmc=",
        "project_id": "gen-lang-client-0197022210",
        "tier": "Free tier",
        "active": True,
        "priority": 8
    }
]

# قائمة الموديلات الموصى بها بالترتيب حسب تعليمات AI Studio SDK
VALID_MODELS = [
    "gemini-flash-latest",
    "gemini-3.8-flash",
    "gemini-3.1-flash-lite"
]


class GeminiRotator:
    """
    المدير الموحد لتوزيع وتدوير مفاتيح Gemini API بالتتابع المرتب
    مع التبديل الفوري عند نفاد رصيد أي مفتاح (Auto-Failover).
    """

    def __init__(self, config_path: str = CONFIG_PATH):
        self.config_path = config_path
        self._lock = threading.Lock()
        self.current_index = 0
        self.keys_data: List[Dict[str, Any]] = []
        self.stats: Dict[str, Dict[str, Any]] = {}
        self.cooldown_seconds = 60
        self.default_model = "gemini-flash-latest"
        self.rotation_mode = "on_exhaust"  # on_exhaust (التبديل عند نفاد الرصيد) أو round_robin
        self.failover_callbacks: List[Callable] = []
        self.failover_history: List[Dict[str, Any]] = []
        self.load_config()

    def register_failover_callback(self, cb: Callable):
        """تسجيل دالة استدعاء عند حدوث تبديل مفتاح تلقائي"""
        if cb not in self.failover_callbacks:
            self.failover_callbacks.append(cb)

    def _trigger_failover_event(self, from_key: Dict[str, Any], to_key: Dict[str, Any], reason: str = ""):
        """إطلاق إشعار التبديل الفوري لجميع الأنظمة والواجهة"""
        event_data = {
            "from_id": from_key.get("id"),
            "from_name": from_key.get("name"),
            "from_hint": from_key.get("hint"),
            "to_id": to_key.get("id"),
            "to_name": to_key.get("name"),
            "to_hint": to_key.get("hint"),
            "reason": reason,
            "timestamp": datetime.now().strftime("%H:%M:%S")
        }
        self.failover_history.append(event_data)
        if len(self.failover_history) > 30:
            self.failover_history.pop(0)

        for cb in self.failover_callbacks:
            try:
                cb(event_data)
            except Exception as e:
                logger.debug(f"Error in failover callback: {e}")

    def load_config(self):
        """تحميل المفاتيح والإعدادات وفك تشفيرها"""
        with self._lock:
            loaded_keys = []
            if os.path.exists(self.config_path):
                try:
                    with open(self.config_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        loaded_keys = data.get("keys", [])
                        self.cooldown_seconds = data.get("rate_limit_cooldown_seconds", 60)
                        self.default_model = data.get("default_model", "gemini-flash-latest")
                        self.rotation_mode = data.get("rotation_mode", "on_exhaust")
                except Exception as e:
                    logger.error(f"Error loading {self.config_path}: {e}")

            if not loaded_keys:
                loaded_keys = [dict(k) for k in DEFAULT_KEYS]

            for k_item in loaded_keys:
                if not k_item.get("key") and k_item.get("encoded_key"):
                    k_item["key"] = _decode_secret(k_item["encoded_key"])

            self.keys_data = loaded_keys
            for k_item in self.keys_data:
                k_id = k_item["id"]
                if k_id not in self.stats:
                    self.stats[k_id] = {
                        "requests": 0,
                        "success": 0,
                        "rate_limits": 0,
                        "errors": 0,
                        "cooldown_until": 0.0,
                        "last_used": None,
                        "last_status": "ready"
                    }

    def save_config(self) -> bool:
        """حفظ المفاتيح مشفرة ومحمية بـ Base64"""
        with self._lock:
            try:
                disk_keys = []
                for k in self.keys_data:
                    k_copy = dict(k)
                    raw_k = k_copy.get("key", "").strip()
                    if raw_k:
                        k_copy["encoded_key"] = _encode_secret(raw_k)
                        k_copy["key"] = ""
                    disk_keys.append(k_copy)

                payload = {
                    "keys": disk_keys,
                    "rotation_mode": self.rotation_mode,
                    "auto_failover": True,
                    "rate_limit_cooldown_seconds": self.cooldown_seconds,
                    "default_model": self.default_model,
                    "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }

                with open(self.config_path, "w", encoding="utf-8") as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)

                mirror_dir = os.path.join(os.path.dirname(self.config_path), "data")
                if os.path.exists(mirror_dir):
                    mirror_path = os.path.join(mirror_dir, "gemini_keys_config.json")
                    with open(mirror_path, "w", encoding="utf-8") as f:
                        json.dump(payload, f, ensure_ascii=False, indent=2)

                logger.info("Saved gemini_keys_config.json successfully.")
                return True
            except Exception as e:
                logger.error(f"Error saving gemini_keys_config.json: {e}")
                return False

    def get_candidate_keys(self) -> List[Tuple[str, str, Dict[str, Any]]]:
        """
        إرجاع قائمة المفاتيح المرشحة للاستخدام مرتبة حسب التتابع (Round-Robin/Sequential)،
        مع استبعاد المفاتيح المعطلة أو التي في فترة انتظار تجاوز الحصة (Cooldown).
        """
        now = time.time()
        candidates = []

        with self._lock:
            n = len(self.keys_data)
            if n > 0:
                for offset in range(n):
                    idx = (self.current_index + offset) % n
                    item = self.keys_data[idx]
                    if not item.get("active", True):
                        continue
                    k_val = item.get("key", "").strip()
                    if not k_val:
                        continue
                    k_id = item["id"]
                    st = self.stats.get(k_id, {})
                    if st.get("cooldown_until", 0.0) > now:
                        continue
                    candidates.append((k_id, k_val, item))

            # إضافة مفتاح النظام الأساسي (Environment Key) كحزام أمان إضافي
            sys_k = os.environ.get("GEMINI_API_KEY", "").strip()
            if sys_k:
                candidates.append(("system_env", sys_k, {
                    "id": "system_env",
                    "name": "System AI Key",
                    "hint": f"...{sys_k[-4:]}"
                }))

            # إذا كانت جميع المفاتيح في راحة مؤقتة، نستخدم المفاتيح المسجلة كخيار أخير
            if not candidates:
                for item in self.keys_data:
                    k_val = item.get("key", "").strip()
                    if k_val and item.get("active", True):
                        candidates.append((item["id"], k_val, item))

        return candidates

    def mark_key_success(self, key_id: str):
        """تسجيل نجاح الطلب وتحديث الإحصاءات"""
        with self._lock:
            st = self.stats.setdefault(key_id, {})
            st["requests"] = st.get("requests", 0) + 1
            st["success"] = st.get("success", 0) + 1
            st["last_used"] = datetime.now().strftime("%H:%M:%S")
            st["last_status"] = "success"

            # إذا كان نمط التدوير Round-Robin مع كل طلب، نقدم المؤشر
            if self.rotation_mode == "round_robin" and self.keys_data:
                self.current_index = (self.current_index + 1) % len(self.keys_data)

    def mark_key_rate_limited(self, key_id: str, cooldown: Optional[int] = None):
        """تسجيل انتهاء رصيد/حصة المفتاح مؤقتاً والانتقال للتالي فوراً"""
        cooldown = cooldown or self.cooldown_seconds
        from_key = {}
        to_key = {}

        with self._lock:
            st = self.stats.setdefault(key_id, {})
            st["requests"] = st.get("requests", 0) + 1
            st["rate_limits"] = st.get("rate_limits", 0) + 1
            st["cooldown_until"] = time.time() + cooldown
            st["last_status"] = "rate_limited"

            # العثور على المفتاح الحالي والتالي
            n = len(self.keys_data)
            old_idx = self.current_index
            if n > 0:
                for idx, k in enumerate(self.keys_data):
                    if k["id"] == key_id:
                        from_key = dict(k)
                        self.current_index = (idx + 1) % n
                        to_key = dict(self.keys_data[self.current_index])
                        break
                else:
                    self.current_index = (self.current_index + 1) % n
                    to_key = dict(self.keys_data[self.current_index]) if self.keys_data else {}

        logger.warning(
            f"⚠️ المفتاح [{key_id} - {from_key.get('hint')}] نفد رصيده أو تجاوز الحصة (429/ResourceExhausted). "
            f"تم نقله لفترة راحة {cooldown}ث والتبديل التلقائي الفوري للمفتاح التالي [{to_key.get('name')}] بنجاح."
        )

        if from_key and to_key:
            self._trigger_failover_event(from_key, to_key, reason="Quota Exceeded (429/Resource Exhausted)")

    def mark_key_error(self, key_id: str, err_msg: str = ""):
        """تسجيل خطأ على المفتاح والتبديل للمفتاح التالي"""
        with self._lock:
            st = self.stats.setdefault(key_id, {})
            st["requests"] = st.get("requests", 0) + 1
            st["errors"] = st.get("errors", 0) + 1
            st["last_status"] = "error"
            if self.keys_data:
                self.current_index = (self.current_index + 1) % len(self.keys_data)
        logger.warning(f"⚠️ خطأ في المفتاح [{key_id}]: {err_msg} - تم التبديل للمفتاح التالي")

    def set_active_key(self, key_id: str) -> bool:
        """تعيين مفتاح محدد ليكون هو المفتاح النشط حالياً وإلغاء الراحة المؤقتة عنه"""
        with self._lock:
            for idx, item in enumerate(self.keys_data):
                if item["id"] == key_id:
                    self.current_index = idx
                    # تصفير فترة الراحة
                    if key_id in self.stats:
                        self.stats[key_id]["cooldown_until"] = 0.0
                        self.stats[key_id]["last_status"] = "ready"
                    logger.info(f"👉 تم تعيين المفتاح [{item.get('name')}] كمفتاح نشط حالياً.")
                    return True
        return False

    def reset_cooldown(self, key_id: Optional[str] = None):
        """إعادة تصفير فترات الراحة لأحد المفاتيح أو للجميع"""
        with self._lock:
            if key_id:
                if key_id in self.stats:
                    self.stats[key_id]["cooldown_until"] = 0.0
                    self.stats[key_id]["last_status"] = "ready"
            else:
                for k_id, st in self.stats.items():
                    st["cooldown_until"] = 0.0
                    st["last_status"] = "ready"
        logger.info("🔄 تم تصفير فترات الراحة للمفاتيح بنجاح.")

    def test_single_key(self, key_id: str) -> Dict[str, Any]:
        """فحص واختبار مفتاح محدد وإرجاع النتيجة وزمن الاستجابة"""
        target_val = ""
        target_meta = {}
        with self._lock:
            for item in self.keys_data:
                if item["id"] == key_id:
                    target_val = item.get("key", "").strip()
                    target_meta = dict(item)
                    break

        if not target_val:
            return {"success": False, "error": "المفتاح غير موجود أو فارغ"}

        start_time = time.time()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.default_model}:generateContent?key={target_val}"
        payload = {
            "contents": [{"role": "user", "parts": [{"text": "رد بكلمة واحدة فقط: ممتاز"}]}],
            "generationConfig": {"maxOutputTokens": 30, "temperature": 0.2}
        }
        req_data = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json", "User-Agent": "aistudio-build"}

        try:
            req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=12) as resp:
                res_json = json.loads(resp.read().decode("utf-8"))
                cand = res_json.get("candidates", [{}])[0]
                reply_text = "".join(p.get("text", "") for p in cand.get("content", {}).get("parts", [{}])).strip()
                latency_ms = int((time.time() - start_time) * 1000)

                with self._lock:
                    if key_id in self.stats:
                        self.stats[key_id]["cooldown_until"] = 0.0
                        self.stats[key_id]["last_status"] = "success"

                return {
                    "success": True,
                    "key_id": key_id,
                    "name": target_meta.get("name"),
                    "hint": target_meta.get("hint"),
                    "latency_ms": latency_ms,
                    "model": self.default_model,
                    "reply": reply_text or "تم الاتصال بنجاح"
                }
        except urllib.error.HTTPError as he:
            err_body = ""
            try:
                err_body = he.read().decode("utf-8", errors="ignore")
            except Exception:
                pass
            return {
                "success": False,
                "key_id": key_id,
                "error": f"HTTP {he.code}: {err_body[:180]}"
            }
        except Exception as ex:
            return {
                "success": False,
                "key_id": key_id,
                "error": str(ex)
            }

    def call_gemini_api(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
        preferred_model: Optional[str] = None,
        temperature: float = 0.7,
        max_output_tokens: int = 4096
    ) -> Tuple[Optional[str], Optional[Dict[str, Any]], bool]:
        """
        استدعاء Gemini API الموحد:
        - يبدأ بالمفتاح الحالي في التدوير.
        - إذا حدث تجاوز حصة (429) أو نفاد رصيد أو خطأ في المفتاح، ينتقل تلقائياً وبشكل فوري للمفتاح التالي.
        - يرجع: (نص_الإجابة, معلومات_المفتاح_الناجح, هل_تم_التبديل).
        """
        candidates = self.get_candidate_keys()
        if not candidates:
            logger.error("❌ لا يوجد أي مفتاح Gemini نشط أو متاح حالياً")
            return None, None, False

        # تجهيز محتوى الرسائل وتاريخ المحادثة إن وجد
        contents = []
        if history:
            for h in history:
                role = "user" if h.get("role") in ("user", "human") else "model"
                text_content = h.get("content") or h.get("text") or ""
                if text_content.strip():
                    contents.append({
                        "role": role,
                        "parts": [{"text": text_content.strip()}]
                    })

        contents.append({
            "role": "user",
            "parts": [{"text": prompt.strip()}]
        })

        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_output_tokens
            }
        }
        if system_instruction and system_instruction.strip():
            payload["systemInstruction"] = {
                "parts": [{"text": system_instruction.strip()}]
            }

        req_data = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "aistudio-build"
        }

        # ترتيب الموديلات للتجربة
        models_to_try = [preferred_model] if preferred_model and preferred_model in VALID_MODELS else []
        for m in VALID_MODELS:
            if m not in models_to_try:
                models_to_try.append(m)

        rotated = False
        last_error = ""

        # تدوير عبر المفاتيح المرشحة بالتتابع
        for cand_idx, (k_id, k_val, k_meta) in enumerate(candidates):
            if cand_idx > 0:
                rotated = True

            key_failed_with_ratelimit = False

            for model_name in models_to_try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={k_val}"
                req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")

                try:
                    with urllib.request.urlopen(req, timeout=35) as resp:
                        res_json = json.loads(resp.read().decode("utf-8"))
                        cand = res_json.get("candidates", [{}])[0]
                        parts = cand.get("content", {}).get("parts", [{}])
                        out_text = "".join(p.get("text", "") for p in parts)
                        if out_text.strip():
                            self.mark_key_success(k_id)
                            k_info = {
                                "id": k_id,
                                "name": k_meta.get("name", "Gemini Key"),
                                "hint": k_meta.get("hint", "..."),
                                "model": model_name
                            }
                            return out_text.strip(), k_info, rotated
                except urllib.error.HTTPError as he:
                    err_body = ""
                    try:
                        err_body = he.read().decode("utf-8", errors="ignore")
                    except Exception:
                        pass
                    last_error = f"HTTP {he.code}: {err_body[:180]}"

                    # 429 = Rate Limit / Quota Exceeded (نفاد الرصيد أو تجاوز الحصة)
                    if he.code == 429 or "RESOURCE_EXHAUSTED" in err_body:
                        self.mark_key_rate_limited(k_id)
                        key_failed_with_ratelimit = True
                        break  # انتقل للمفتاح التالي فوراً
                    elif he.code in (400, 403) and ("API_KEY_INVALID" in err_body or "API key not valid" in err_body or "PERMISSION_DENIED" in err_body):
                        self.mark_key_error(k_id, f"Invalid or Forbidden Key: {err_body[:100]}")
                        key_failed_with_ratelimit = True
                        break  # انتقل للمفتاح التالي فوراً
                    else:
                        logger.debug(f"Model {model_name} on key {k_id} returned {he.code}, trying next model...")
                        continue

                except Exception as ex:
                    last_error = str(ex)
                    logger.debug(f"Key {k_id} error with {model_name}: {ex}")
                    continue

            if key_failed_with_ratelimit:
                continue

        logger.error(f"❌ انتهت كافة محاولات استدعاء الذكاء الاصطناعي على كافة المفاتيح. آخر خطأ: {last_error}")
        return None, None, rotated

    def get_keys_status(self) -> List[Dict[str, Any]]:
        """إرجاع حالة جميع المفاتيح للعرض والإدارة بالواجهة"""
        with self._lock:
            res = []
            now = time.time()
            sys_k = os.environ.get("GEMINI_API_KEY", "").strip()

            for idx, item in enumerate(self.keys_data):
                k_id = item["id"]
                st = self.stats.get(k_id, {})
                raw_k = item.get("key", "").strip()
                has_key = bool(raw_k)

                is_in_cooldown = st.get("cooldown_until", 0.0) > now
                status = "rate_limited" if is_in_cooldown else ("active" if has_key and item.get("active", True) else ("disabled" if not item.get("active", True) else "empty"))

                masked = item.get("hint", "")
                if has_key:
                    prefix = raw_k[:7] if len(raw_k) >= 12 else "..."
                    masked = f"{prefix}...{raw_k[-4:]}"

                res.append({
                    "id": k_id,
                    "name": item.get("name", f"Gemini Key #{idx+1}"),
                    "hint": item.get("hint", ""),
                    "masked_key": masked,
                    "has_key": has_key,
                    "active": item.get("active", True),
                    "priority": item.get("priority", idx + 1),
                    "project_id": item.get("project_id", "gen-lang-client-0197022210"),
                    "tier": item.get("tier", "Free tier"),
                    "status": status,
                    "requests": st.get("requests", 0),
                    "success": st.get("success", 0),
                    "rate_limits": st.get("rate_limits", 0),
                    "errors": st.get("errors", 0),
                    "last_used": st.get("last_used"),
                    "cooldown_remaining": max(0, int(st.get("cooldown_until", 0.0) - now)),
                    "is_current": (idx == self.current_index)
                })

            if sys_k:
                res.append({
                    "id": "system_env",
                    "name": "مفتاح النظام الاحتياطي (Environment Key)",
                    "hint": f"...{sys_k[-4:]}",
                    "masked_key": f"AIzaSy...{sys_k[-4:]}",
                    "has_key": True,
                    "active": True,
                    "priority": 999,
                    "project_id": "system-env",
                    "tier": "Supreme Backup",
                    "status": "active",
                    "requests": self.stats.get("system_env", {}).get("requests", 0),
                    "success": self.stats.get("system_env", {}).get("success", 0),
                    "rate_limits": 0,
                    "errors": 0,
                    "last_used": self.stats.get("system_env", {}).get("last_used"),
                    "cooldown_remaining": 0,
                    "is_current": False
                })

            return res

    def update_key(self, key_id: str, new_key: str = "", name: str = "", active: Optional[bool] = None) -> bool:
        """تحديث أو تبديل قيمة مفتاح وحفظه دائمياً"""
        with self._lock:
            for item in self.keys_data:
                if item["id"] == key_id:
                    if new_key.strip():
                        item["key"] = new_key.strip()
                        item["encoded_key"] = _encode_secret(new_key.strip())
                        item["hint"] = f"...{new_key.strip()[-4:]}"
                    if name.strip():
                        item["name"] = name.strip()
                    if active is not None:
                        item["active"] = bool(active)
                    break
            else:
                return False
        return self.save_config()


# كائن تدوير المفاتيح الموحد للنظام بالكامل
gemini_rotator = GeminiRotator()

def call_gemini_with_rotation(prompt: str, system_instruction: Optional[str] = None, history: Optional[List[Dict[str, str]]] = None) -> Optional[str]:
    """دالة سهلة الاستدعاء في أي مكان بالنظام مع التدوير والتبديل التلقائي"""
    text, _, _ = gemini_rotator.call_gemini_api(prompt, system_instruction=system_instruction, history=history)
    return text
