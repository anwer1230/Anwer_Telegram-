import json
import logging
import os
import subprocess

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BRIDGE_SCRIPT = os.path.join(BASE_DIR, 'firestore_bridge.js')

def get_saved_phone_numbers():
    """استرجاع أرقام الهواتف المحفوظة من Firestore"""
    try:
        proc = subprocess.run(
            ['node', BRIDGE_SCRIPT, 'get_phones'],
            capture_output=True, text=True, timeout=10, cwd=BASE_DIR
        )
        if proc.returncode == 0:
            res = json.loads(proc.stdout.strip())
            if res.get('success'):
                return res.get('phones', [])
    except Exception as e:
        logger.error(f"Error fetching phones from Firestore: {e}")
    return [
        {"phone_number": "+573244867204", "is_default": True, "label": "رقم أساسي"},
        {"phone_number": "+201221349790", "is_default": True, "label": "رقم أساسي"},
        {"phone_number": "+201148863243", "is_default": True, "label": "رقم أساسي"},
        {"phone_number": "+213797500921", "is_default": True, "label": "رقم أساسي"},
        {"phone_number": "+201274386864", "is_default": True, "label": "رقم أساسي"},
        {"phone_number": "+201120945094", "is_default": True, "label": "رقم أساسي"},
        {"phone_number": "+966539709737", "is_default": True, "label": "رقم أساسي"}
    ]

def save_phone_number(phone, label='رقم محفوظ'):
    """حفظ رقم هاتف جديد في Firestore"""
    if not phone:
        return None
    try:
        proc = subprocess.run(
            ['node', BRIDGE_SCRIPT, 'add_phone', phone.strip()],
            capture_output=True, text=True, timeout=10, cwd=BASE_DIR
        )
        if proc.returncode == 0:
            res = json.loads(proc.stdout.strip())
            if res.get('success'):
                return res.get('phone')
    except Exception as e:
        logger.error(f"Error saving phone to Firestore: {e}")
    return None

def get_firestore_links():
    """استرجاع كل الروابط المحفوظة من Firestore"""
    try:
        proc = subprocess.run(
            ['node', BRIDGE_SCRIPT, 'get_links'],
            capture_output=True, text=True, timeout=10, cwd=BASE_DIR
        )
        if proc.returncode == 0:
            res = json.loads(proc.stdout.strip())
            if res.get('success'):
                return res.get('links', [])
    except Exception as e:
        logger.error(f"Error fetching links from Firestore: {e}")
    return []

def add_firestore_link(link_dict):
    """حفظ رابط في Firestore"""
    try:
        proc = subprocess.run(
            ['node', BRIDGE_SCRIPT, 'add_link', json.dumps(link_dict, ensure_ascii=False)],
            capture_output=True, text=True, timeout=10, cwd=BASE_DIR
        )
        if proc.returncode == 0:
            res = json.loads(proc.stdout.strip())
            if res.get('success'):
                return res.get('link')
    except Exception as e:
        logger.error(f"Error saving link to Firestore: {e}")
    return None

def delete_firestore_link(link_id):
    """حذف رابط من Firestore"""
    try:
        proc = subprocess.run(
            ['node', BRIDGE_SCRIPT, 'delete_link', str(link_id)],
            capture_output=True, text=True, timeout=10, cwd=BASE_DIR
        )
        if proc.returncode == 0:
            res = json.loads(proc.stdout.strip())
            return res.get('success', False)
    except Exception as e:
        logger.error(f"Error deleting link from Firestore: {e}")
    return False

import re
import threading

LOCAL_SAFETY_CACHE_FILE = os.path.join(BASE_DIR, 'data', 'group_safety_cache.json')
_SAFETY_CACHE_LOCK = threading.Lock()

def _load_local_safety_cache():
    try:
        if os.path.exists(LOCAL_SAFETY_CACHE_FILE):
            with open(LOCAL_SAFETY_CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        logger.debug(f"Error loading local safety cache: {e}")
    return {}

def _save_local_safety_cache(cache):
    try:
        os.makedirs(os.path.dirname(LOCAL_SAFETY_CACHE_FILE), exist_ok=True)
        with open(LOCAL_SAFETY_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.debug(f"Error saving local safety cache: {e}")

def get_group_safety_report_from_db(group_key, alt_key=None):
    """
    استرجاع تقرير الفحص والتحقق للمجموعة من قاعدة البيانات الخارجية (Firestore)
    مع الاستفادة من الذاكرة المحلية لتسريع القراءة والالتزام بالنتائج المحفوظة.
    """
    if not group_key and not alt_key:
        return None

    keys_to_check = [k for k in [group_key, alt_key] if k]

    # 1. فحص الكاش المحلي أولاً للسرعة
    with _SAFETY_CACHE_LOCK:
        local_cache = _load_local_safety_cache()
        for k in keys_to_check:
            clean_k = str(k).strip().lower()
            if clean_k in local_cache:
                return local_cache[clean_k]
            norm_k = re.sub(r'^(?:https?://)?(?:t\.me|telegram\.me)/', '', clean_k).lstrip('@')
            if norm_k in local_cache:
                return local_cache[norm_k]

    # 2. استرجاع من قاعدة البيانات الخارجية Firestore
    for k in keys_to_check:
        try:
            proc = subprocess.run(
                ['node', BRIDGE_SCRIPT, 'get_group_report', str(k).strip()],
                capture_output=True, text=True, timeout=8, cwd=BASE_DIR
            )
            if proc.returncode == 0:
                res = json.loads(proc.stdout.strip())
                if res.get('success') and res.get('report'):
                    report = res['report']
                    with _SAFETY_CACHE_LOCK:
                        local_cache = _load_local_safety_cache()
                        local_cache[str(k).strip().lower()] = report
                        if alt_key:
                            local_cache[str(alt_key).strip().lower()] = report
                        _save_local_safety_cache(local_cache)
                    return report
        except Exception as e:
            logger.error(f"Error fetching group safety report from Firestore for {k}: {e}")

    return None

def save_group_safety_report_to_db(report_dict):
    """
    حفظ نتائج فحص وتحليل المجموعة بشكل دائم وثابت داخل قاعدة البيانات الخارجية Firestore
    وكذلك في الكاش المحلي لضمان دوامها عبر الجلسات والتشغيل.
    """
    if not report_dict:
        return None

    key = report_dict.get('group_key') or report_dict.get('group_id') or report_dict.get('group_title')
    if not key:
        return None

    # 1. حفظ فوري في الكاش المحلي
    with _SAFETY_CACHE_LOCK:
        local_cache = _load_local_safety_cache()
        local_cache[str(key).strip().lower()] = report_dict
        if report_dict.get('group_id'):
            local_cache[str(report_dict['group_id']).strip().lower()] = report_dict
        if report_dict.get('username'):
            local_cache[str(report_dict['username']).strip().lower()] = report_dict
        _save_local_safety_cache(local_cache)

    # 2. حفظ في قاعدة بيانات Firestore الخارجية
    try:
        proc = subprocess.run(
            ['node', BRIDGE_SCRIPT, 'save_group_report', json.dumps(report_dict, ensure_ascii=False)],
            capture_output=True, text=True, timeout=12, cwd=BASE_DIR
        )
        if proc.returncode == 0:
            res = json.loads(proc.stdout.strip())
            if res.get('success'):
                logger.info(f"✅ Successfully saved group safety report to Firestore for {key}")
                return res.get('report')
    except Exception as e:
        logger.error(f"Error saving group safety report to Firestore: {e}")

    return report_dict

