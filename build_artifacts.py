#!/usr/bin/env python3
"""
Build artifacts generator for Abu Malk / Anwer Telegram Services
Ensures the 'dist' directory is populated with all client assets, templates,
manifests, icons, and build-info metadata required for AI Studio deployment.
"""

import os
import sys
import shutil
import json
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(BASE_DIR, 'dist')

def build():
    print(f"[*] Starting build process in {BASE_DIR}...")
    
    # 1. Ensure dist directory exists
    os.makedirs(DIST_DIR, exist_ok=True)
    
    # 2. Copy public directory assets if present
    public_dir = os.path.join(BASE_DIR, 'public')
    if os.path.isdir(public_dir):
        print("[*] Copying public/ assets to dist/...")
        for item in os.listdir(public_dir):
            s = os.path.join(public_dir, item)
            d = os.path.join(DIST_DIR, item)
            if os.path.isdir(s):
                if os.path.exists(d):
                    shutil.rmtree(d)
                shutil.copytree(s, d)
            else:
                shutil.copy2(s, d)
    
    # 3. Copy index.html
    root_index = os.path.join(BASE_DIR, 'index.html')
    if os.path.isfile(root_index):
        print("[*] Copying index.html to dist/...")
        shutil.copy2(root_index, os.path.join(DIST_DIR, 'index.html'))
    elif not os.path.isfile(os.path.join(DIST_DIR, 'index.html')):
        # Create fallback index.html if none exists
        with open(os.path.join(DIST_DIR, 'index.html'), 'w', encoding='utf-8') as f:
            f.write("<!DOCTYPE html><html><head><meta charset='utf-8'><title>Telegram Services</title></head><body><h1>Telegram Services</h1></body></html>")
    
    # 4. Copy static/ directory
    static_dir = os.path.join(BASE_DIR, 'static')
    if os.path.isdir(static_dir):
        print("[*] Copying static/ to dist/static/...")
        dist_static = os.path.join(DIST_DIR, 'static')
        if os.path.exists(dist_static):
            shutil.rmtree(dist_static)
        shutil.copytree(static_dir, dist_static)
        
    # 5. Copy templates/ directory
    templates_dir = os.path.join(BASE_DIR, 'templates')
    if os.path.isdir(templates_dir):
        print("[*] Copying templates/ to dist/templates/...")
        dist_templates = os.path.join(DIST_DIR, 'templates')
        if os.path.exists(dist_templates):
            shutil.rmtree(dist_templates)
        shutil.copytree(templates_dir, dist_templates)

    # 6. Copy manifest and service worker if present in root
    for fname in ('manifest.json', 'sw.js'):
        src_file = os.path.join(BASE_DIR, fname)
        if os.path.isfile(src_file):
            shutil.copy2(src_file, os.path.join(DIST_DIR, fname))

    # 7. Collect file list and compute sizes
    artifacts = []
    total_size = 0
    for root, _, files in os.walk(DIST_DIR):
        for f in files:
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, DIST_DIR)
            sz = os.path.getsize(full_path)
            total_size += sz
            artifacts.append({
                "path": rel_path,
                "size_bytes": sz
            })

    # 8. Write build-info.json metadata
    build_info = {
        "status": "success",
        "timestamp": int(time.time()),
        "iso_timestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        "app_name": "Abu Malk Services",
        "total_files": len(artifacts),
        "total_size_bytes": total_size,
        "artifacts": artifacts
    }
    with open(os.path.join(DIST_DIR, 'build-info.json'), 'w', encoding='utf-8') as f:
        json.dump(build_info, f, indent=2, ensure_ascii=False)

    print(f"[✓] Build artifacts generated successfully: {len(artifacts)} files ({total_size} bytes) in {DIST_DIR}")
    return 0

if __name__ == '__main__':
    sys.exit(build())
