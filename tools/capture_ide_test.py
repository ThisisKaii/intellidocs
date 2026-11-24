"""
IntelliDocs — Automated IDE Screenshot Capture Tool for Chapter 4 Manuscript
Captures the active IntelliJ / PyCharm window showing both code on the left
and terminal / test output on the right.

Uses Windows Win32 ctypes API + GDI+ for high-fidelity direct window capture.
"""

import os
import sys
import time
from datetime import datetime
import ctypes
from ctypes import wintypes

FIGURES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "docs", "manuscript", "figures", "chapter_4"))
os.makedirs(FIGURES_DIR, exist_ok=True)

user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32
gdiplus = ctypes.windll.gdiplus

# GDI+ Structs
class GdiplusStartupInput(ctypes.Structure):
    _fields_ = [
        ("GdiplusVersion", wintypes.UINT),
        ("DebugEventCallback", ctypes.c_void_p),
        ("SuppressBackgroundThread", wintypes.BOOL),
        ("SuppressExternalCodecs", wintypes.BOOL)
    ]

class CLSID(ctypes.Structure):
    _fields_ = [
        ("Data1", wintypes.DWORD),
        ("Data2", wintypes.WORD),
        ("Data3", wintypes.WORD),
        ("Data4", wintypes.BYTE * 8)
    ]

# PNG Encoder CLSID: {557cf406-1a04-11d3-9a73-0000f81ef32e}
CLSID_PNG = CLSID(0x557cf406, 0x1a04, 0x11d3, (wintypes.BYTE * 8)(0x9a, 0x73, 0x00, 0x00, 0xf8, 0x1e, 0xf3, 0x2e))

def _attach_desktop():
    """Attaches the current process and thread to the interactive desktop station."""
    winsta = user32.OpenWindowStationW('WinSta0', False, 0x10000000)
    if winsta:
        user32.SetProcessWindowStation(winsta)
    desk = user32.OpenDesktopW('Default', 0, False, 0x10000000)
    if desk:
        user32.SetThreadDesktop(desk)

def _find_target_hwnd(keyword="PyCharm"):
    """Finds the main window handle for PyCharm or IntelliJ by process and title."""
    _attach_desktop()
    
    user32.EnumWindows.argtypes = [ctypes.c_void_p, wintypes.LPARAM]
    user32.EnumWindows.restype = wintypes.BOOL
    user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetWindowTextW.restype = ctypes.c_int
    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    user32.IsWindowVisible.restype = wintypes.BOOL

    matches = []

    def enum_cb(hwnd, _):
        if user32.IsWindowVisible(hwnd):
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            buff = ctypes.create_unicode_buffer(512)
            n = user32.GetWindowTextW(hwnd, buff, 512)
            if n > 0:
                title = buff.value
                # Exclude own IDE (Antigravity/Zed) and browsers
                if any(x in title for x in ["Antigravity", "Brave", "Chrome", "Firefox", "Edge", "Claude"]):
                    return True
                if any(k.lower() in title.lower() for k in [keyword, "PyCharm", "IntelliJ", "Idea", "intellidocs –"]):
                    matches.append((hwnd, pid.value, title))
        return True

    WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows(WNDENUMPROC(enum_cb), 0)

    if matches:
        return matches[0][0]
    return None

def capture_window_native(window_title_keyword="PyCharm", output_name="test_result", dest_dir=None):
    """Captures the target IDE window directly using Win32 PrintWindow and GDI+."""
    _attach_desktop()
    target_hwnd = _find_target_hwnd(window_title_keyword)
    
    if not target_hwnd:
        target_hwnd = user32.GetForegroundWindow()

    if not target_hwnd:
        print("[Error] No target window found.")
        return None

    # Focus window
    user32.SetForegroundWindow(target_hwnd)
    time.sleep(0.3)

    rect = wintypes.RECT()
    user32.GetWindowRect(target_hwnd, ctypes.byref(rect))
    w = rect.right - rect.left
    h = rect.bottom - rect.top

    if w <= 0 or h <= 0:
        print(f"[Error] Invalid window dimensions: {w}x{h}")
        return None

    out_dir = dest_dir or FIGURES_DIR
    os.makedirs(out_dir, exist_ok=True)
    filename = f"{output_name}.png" if output_name.endswith(".png") else f"{output_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
    filepath = os.path.join(out_dir, filename)

    # Capture window via PrintWindow
    hdc_window = user32.GetWindowDC(target_hwnd)
    hdc_mem = gdi32.CreateCompatibleDC(hdc_window)
    hbm = gdi32.CreateCompatibleBitmap(hdc_window, w, h)
    old_hbm = gdi32.SelectObject(hdc_mem, hbm)

    # Try PW_RENDERFULLCONTENT (2), fallback to 0
    if not user32.PrintWindow(target_hwnd, hdc_mem, 2):
        user32.PrintWindow(target_hwnd, hdc_mem, 0)

    # Save bitmap to PNG using GDI+
    token = ctypes.c_void_p()
    startup = GdiplusStartupInput(1, None, False, False)
    gdiplus.GdiplusStartup(ctypes.byref(token), ctypes.byref(startup), None)

    gp_bitmap = ctypes.c_void_p()
    gdiplus.GdipCreateBitmapFromHBITMAP(hbm, 0, ctypes.byref(gp_bitmap))

    status = gdiplus.GdipSaveImageToFile(gp_bitmap, ctypes.c_wchar_p(filepath), ctypes.byref(CLSID_PNG), None)

    gdiplus.GdipDisposeImage(gp_bitmap)
    gdiplus.GdiplusShutdown(token)

    gdi32.SelectObject(hdc_mem, old_hbm)
    gdi32.DeleteObject(hbm)
    gdi32.DeleteDC(hdc_mem)
    user32.ReleaseDC(target_hwnd, hdc_window)

    if status == 0 and os.path.exists(filepath):
        print(f"[Screenshot Successfully Saved] -> {filepath}")
        return filepath
    else:
        print(f"[Error saving screenshot] GDI+ status: {status}")
        return None

if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else "IDE_Test_Result"
    keyword = sys.argv[2] if len(sys.argv) > 2 else "PyCharm"
    capture_window_native(window_title_keyword=keyword, output_name=name)
