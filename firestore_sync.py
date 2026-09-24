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
        {"phone_number": "+201274386864", "is_default": True, "label": "رقم أساسي"}
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
