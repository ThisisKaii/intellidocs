from playwright.sync_api import sync_playwright

def check():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel='chrome')
        page = browser.new_page(viewport={'width': 1600, 'height': 950})
        page.on('console', lambda m: print('CONSOLE:', m.type, m.text))
        page.on('pageerror', lambda e: print('PAGEERROR:', e))
        
        page.goto('http://localhost:5173/login')
        page.fill('input#email', 'test@test.com')
        page.fill('input#password', 'asd123')
        page.click('button[type=submit]')
        page.wait_for_url('http://localhost:5173/dashboard')
        page.goto('http://localhost:5173/document/a3c5c8ac-29c6-4f9a-a996-884ba169f81d')
        page.wait_for_selector('.ProseMirror', timeout=15000)
        page.wait_for_timeout(2000)
        
        print('Clicking Suggestions tab...')
        btn = page.locator("button:has-text('Suggestions')").first
        btn.click()
        page.wait_for_timeout(2000)
        
        screenshot_path = "C:/Users/asus/.gemini/antigravity/brain/9dcfe603-ca1e-4a77-a93d-644ee7188bc7/debug_tab_screenshot.png"
        page.screenshot(path=screenshot_path)
        print("Done. Screenshot saved to", screenshot_path)

if __name__ == '__main__':
    check()
